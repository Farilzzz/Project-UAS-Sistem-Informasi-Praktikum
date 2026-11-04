<?php
declare(strict_types=1);

require_once __DIR__ . '/../src/bootstrap.php';

use Gdss\App;
use Gdss\ApiError;
use Gdss\DecisionService;

$passed = 0;
$failed = 0;

function it(string $testName, callable $fn): void
{
    global $passed, $failed;
    try {
        $fn();
        $passed++;
        echo " [PASS] " . $testName . PHP_EOL;
    } catch (\Throwable $e) {
        $failed++;
        echo " [FAIL] " . $testName . " -> " . $e->getMessage() . " in " . $e->getFile() . ":" . $e->getLine() . PHP_EOL;
    }
}

function assertEquals(mixed $expected, mixed $actual, string $msg = ''): void
{
    if ($expected !== $actual) {
        throw new RuntimeException($msg . ' Expected ' . var_export($expected, true) . ' but got ' . var_export($actual, true));
    }
}

function assertClose(float $expected, float $actual, float $delta = 0.001, string $msg = ''): void
{
    if (abs($expected - $actual) > $delta) {
        throw new RuntimeException($msg . " Expected {$expected} +/- {$delta}, got {$actual}");
    }
}

function assertTrue(bool $condition, string $msg = ''): void
{
    if (!$condition) {
        throw new RuntimeException($msg . ' Expected true but got false');
    }
}

function createTestDb(): PDO
{
    $pdo = new PDO('sqlite::memory:', null, null, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);
    $pdo->exec('PRAGMA foreign_keys = ON;');

    $pdo->exec("
        CREATE TABLE users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE,
            name TEXT NOT NULL,
            role TEXT NOT NULL CHECK(role IN ('chair', 'member', 'voter')) DEFAULT 'voter',
            password_hash TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE candidates (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            vision TEXT,
            mission TEXT,
            profile TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE criteria (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code TEXT NOT NULL UNIQUE,
            name TEXT NOT NULL,
            weight INTEGER NOT NULL CHECK(weight > 0),
            type TEXT NOT NULL CHECK(type IN ('benefit', 'cost')),
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE decision_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            description TEXT,
            status TEXT NOT NULL CHECK(status IN ('assessment', 'voting', 'tie_revote', 'voting_completed', 'ratified')),
            current_round INTEGER NOT NULL DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE assessments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id INTEGER NOT NULL DEFAULT 1,
            user_id INTEGER NOT NULL,
            candidate_id INTEGER NOT NULL,
            criterion_id INTEGER NOT NULL,
            score INTEGER NOT NULL CHECK(score BETWEEN 1 AND 5),
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(session_id, user_id, candidate_id, criterion_id),
            FOREIGN KEY(session_id) REFERENCES decision_sessions(id) ON DELETE CASCADE,
            FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY(candidate_id) REFERENCES candidates(id) ON DELETE CASCADE,
            FOREIGN KEY(criterion_id) REFERENCES criteria(id) ON DELETE CASCADE
        );
        CREATE TABLE assessment_status (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id INTEGER NOT NULL DEFAULT 1,
            user_id INTEGER NOT NULL,
            is_finalized INTEGER NOT NULL DEFAULT 0,
            finalized_at DATETIME,
            UNIQUE(session_id, user_id),
            FOREIGN KEY(session_id) REFERENCES decision_sessions(id) ON DELETE CASCADE,
            FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
        );
        CREATE TABLE voting_rounds (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id INTEGER NOT NULL DEFAULT 1,
            round_number INTEGER NOT NULL,
            status TEXT NOT NULL CHECK(status IN ('open', 'completed', 'tie_revote')),
            opened_by INTEGER NOT NULL,
            opened_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            closed_at DATETIME,
            UNIQUE(session_id, round_number),
            FOREIGN KEY(session_id) REFERENCES decision_sessions(id) ON DELETE CASCADE,
            FOREIGN KEY(opened_by) REFERENCES users(id)
        );
        CREATE TABLE votes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id INTEGER NOT NULL DEFAULT 1,
            round_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            candidate_id INTEGER NOT NULL,
            voted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(round_id, user_id),
            FOREIGN KEY(session_id) REFERENCES decision_sessions(id) ON DELETE CASCADE,
            FOREIGN KEY(round_id) REFERENCES voting_rounds(id) ON DELETE CASCADE,
            FOREIGN KEY(user_id) REFERENCES users(id),
            FOREIGN KEY(candidate_id) REFERENCES candidates(id)
        );
        CREATE TABLE final_decisions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id INTEGER NOT NULL DEFAULT 1,
            round_id INTEGER NOT NULL,
            candidate_id INTEGER NOT NULL,
            approved_by INTEGER NOT NULL,
            reason TEXT NOT NULL,
            total_votes INTEGER NOT NULL,
            percentage REAL NOT NULL,
            approved_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(session_id),
            FOREIGN KEY(session_id) REFERENCES decision_sessions(id) ON DELETE CASCADE,
            FOREIGN KEY(round_id) REFERENCES voting_rounds(id),
            FOREIGN KEY(candidate_id) REFERENCES candidates(id),
            FOREIGN KEY(approved_by) REFERENCES users(id)
        );
        CREATE TABLE session_voters (
            session_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (session_id, user_id),
            FOREIGN KEY(session_id) REFERENCES decision_sessions(id) ON DELETE CASCADE,
            FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
        );
        CREATE TABLE login_attempts (
            bucket TEXT PRIMARY KEY,
            attempts INTEGER NOT NULL DEFAULT 1,
            started_at INTEGER NOT NULL
        );
        CREATE TABLE audit_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id INTEGER,
            user_id INTEGER,
            action TEXT NOT NULL,
            details TEXT NOT NULL,
            ip_address TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL
        );
    ");

    // Seed Data
    $passHash = password_hash('password123', PASSWORD_BCRYPT);
    $pdo->exec("
        INSERT INTO users (id, username, name, role, password_hash) VALUES
        (1, 'dm1', 'Ketua Panel', 'chair', '{$passHash}'),
        (2, 'dm2', 'Anggota Panel 1', 'member', '{$passHash}'),
        (3, 'dm3', 'Anggota Panel 2', 'member', '{$passHash}');

        INSERT INTO candidates (id, name, vision, mission, profile) VALUES
        (1, 'Kandidat A', 'Visi A', 'Misi A', 'Profil A'),
        (2, 'Kandidat B', 'Visi B', 'Misi B', 'Profil B'),
        (3, 'Kandidat C', 'Visi C', 'Misi C', 'Profil C');

        INSERT INTO criteria (id, code, name, weight, type) VALUES
        (1, 'C1', 'Pengalaman kepemimpinan', 25, 'benefit'),
        (2, 'C2', 'Kejelasan program kerja', 30, 'benefit'),
        (3, 'C3', 'Rekam jejak kegiatan', 25, 'benefit'),
        (4, 'C4', 'Kemampuan komunikasi', 20, 'benefit');

        INSERT INTO decision_sessions (id, title, description, status, current_round) VALUES
        (1, 'Simulasi GDSS Pemilihan Calon Presiden 2026', 'Deskripsi Sesi', 'assessment', 0);

        -- Nilai matriks Excel
        INSERT INTO assessments (session_id, user_id, candidate_id, criterion_id, score) VALUES
        (1, 1, 1, 1, 5), (1, 1, 1, 2, 5), (1, 1, 1, 3, 4), (1, 1, 1, 4, 4),
        (1, 1, 2, 1, 4), (1, 1, 2, 2, 4), (1, 1, 2, 3, 5), (1, 1, 2, 4, 4),
        (1, 1, 3, 1, 3), (1, 1, 3, 2, 4), (1, 1, 3, 3, 4), (1, 1, 3, 4, 5),

        (1, 2, 1, 1, 4), (1, 2, 1, 2, 5), (1, 2, 1, 3, 4), (1, 2, 1, 4, 4),
        (1, 2, 2, 1, 5), (1, 2, 2, 2, 5), (1, 2, 2, 3, 5), (1, 2, 2, 4, 4),
        (1, 2, 3, 1, 4), (1, 2, 3, 2, 3), (1, 2, 3, 3, 4), (1, 2, 3, 4, 5),

        (1, 3, 1, 1, 5), (1, 3, 1, 2, 5), (1, 3, 1, 3, 4), (1, 3, 1, 4, 5),
        (1, 3, 2, 1, 4), (1, 3, 2, 2, 4), (1, 3, 2, 3, 4), (1, 3, 2, 4, 3),
        (1, 3, 3, 1, 4), (1, 3, 3, 2, 4), (1, 3, 3, 3, 5), (1, 3, 3, 4, 4);

        INSERT INTO assessment_status (session_id, user_id, is_finalized, finalized_at) VALUES
        (1, 1, 0, NULL),
        (1, 2, 0, NULL),
        (1, 3, 0, NULL);
    ");

    return $pdo;
}

echo "=== MENJALANKAN AUTOMATED TEST BACKEND GDSS (16 TEST CASES) ===" . PHP_EOL;

// 1. Login berhasil
it('Test 1: Login berhasil dengan kredensial benar', function () {
    $db = createTestDb();
    $app = new App($db);
    $user = $app->login('dm1', 'password123', '127.0.0.1');
    assertEquals('dm1', $user['username']);
    assertEquals('chair', $user['role']);
    assertEquals('Ketua Panel', $user['name']);
});

// 2. Login password salah
it('Test 2: Login gagal jika password salah', function () {
    $db = createTestDb();
    $app = new App($db);
    try {
        $app->login('dm1', 'wrong_pass', '127.0.0.1');
        throw new RuntimeException('Harusnya melempar ApiError 401');
    } catch (ApiError $e) {
        assertEquals(401, $e->httpStatus);
    }
});

// 3. Akses tanpa autentikasi ditolak
it('Test 3: Akses tanpa autentikasi (null user) ditolak dengan 401', function () {
    $db = createTestDb();
    $app = new App($db);
    try {
        $app->getAssessmentsMe(null);
        throw new RuntimeException('Harusnya melempar ApiError 401');
    } catch (ApiError $e) {
        assertEquals(401, $e->httpStatus);
    }
});

// 4. DM tidak dapat mengakses aksi khusus ketua
it('Test 4: Anggota (member) tidak dapat membuka voting (khusus chair)', function () {
    $db = createTestDb();
    $app = new App($db);
    $member = ['id' => 2, 'username' => 'dm2', 'role' => 'member', 'name' => 'Anggota 1'];
    try {
        $app->openVoting($member);
        throw new RuntimeException('Harusnya melempar ApiError 403');
    } catch (ApiError $e) {
        assertEquals(403, $e->httpStatus);
    }
});

// 5. Penilaian tidak lengkap tidak bisa difinalisasi
it('Test 5: Penilaian yang belum lengkap tidak dapat difinalisasi', function () {
    $db = createTestDb();
    $app = new App($db);
    // Hapus satu penilaian DM1 agar tidak lengkap (hanya 11 dari 12)
    $db->exec('DELETE FROM assessments WHERE user_id = 1 AND candidate_id = 1 AND criterion_id = 1');
    $chair = ['id' => 1, 'username' => 'dm1', 'role' => 'chair', 'name' => 'Ketua Panel'];
    try {
        $app->finalizeAssessmentsMe($chair);
        throw new RuntimeException('Harusnya melempar ApiError 422');
    } catch (ApiError $e) {
        assertEquals(422, $e->httpStatus);
    }
});

// 6. Skor SAW sesuai Excel
it('Test 6: Skor SAW masing-masing DM presisi 100% sesuai target Excel', function () {
    $db = createTestDb();
    $app = new App($db);

    // Finalisasikan seluruh DM
    $db->exec('UPDATE assessment_status SET is_finalized = 1');

    $dm1 = ['id' => 1, 'username' => 'dm1', 'role' => 'chair', 'name' => 'Ketua Panel'];
    $saw1 = $app->calculateSawMe($dm1)['rankings'];
    $scores1 = array_column($saw1, 'final_score', 'candidate_id');
    assertEquals(91.0, (float)$scores1[1], 'DM1 Skor A');
    assertEquals(85.0, (float)$scores1[2], 'DM1 Skor B');
    assertEquals(79.0, (float)$scores1[3], 'DM1 Skor C');

    $dm2 = ['id' => 2, 'username' => 'dm2', 'role' => 'member', 'name' => 'Anggota 1'];
    $saw2 = $app->calculateSawMe($dm2)['rankings'];
    $scores2 = array_column($saw2, 'final_score', 'candidate_id');
    assertEquals(86.0, (float)$scores2[1], 'DM2 Skor A');
    assertEquals(96.0, (float)$scores2[2], 'DM2 Skor B');
    assertEquals(78.0, (float)$scores2[3], 'DM2 Skor C');

    $dm3 = ['id' => 3, 'username' => 'dm3', 'role' => 'member', 'name' => 'Anggota 2'];
    $saw3 = $app->calculateSawMe($dm3)['rankings'];
    $scores3 = array_column($saw3, 'final_score', 'candidate_id');
    assertEquals(95.0, (float)$scores3[1], 'DM3 Skor A');
    assertEquals(76.0, (float)$scores3[2], 'DM3 Skor B');
    assertEquals(85.0, (float)$scores3[3], 'DM3 Skor C');
});

// 7. Borda sesuai Excel
it('Test 7: Agregasi Borda menghasilkan poin dan persentase tepat sesuai Excel', function () {
    $db = createTestDb();
    $app = new App($db);
    $db->exec('UPDATE assessment_status SET is_finalized = 1');

    $borda = $app->calculateBorda();
    $points = array_column($borda['rankings'], 'borda_points', 'candidate_id');
    $percentages = array_column($borda['rankings'], 'percentage', 'candidate_id');

    // Excel target: A = 8 poin (44.44%), B = 6 poin (33.33%), C = 4 poin (22.22%)
    assertEquals(8.0, (float)$points[1], 'Poin Borda A');
    assertEquals(6.0, (float)$points[2], 'Poin Borda B');
    assertEquals(4.0, (float)$points[3], 'Poin Borda C');

    assertClose(44.44, (float)$percentages[1], 0.01, 'Persentase A');
    assertClose(33.33, (float)$percentages[2], 0.01, 'Persentase B');
    assertClose(22.22, (float)$percentages[3], 0.01, 'Persentase C');
});

// 8. Voting tidak dapat dibuka sebelum seluruh DM selesai menilai
it('Test 8: Voting tidak dapat dibuka sebelum seluruh DM memfinalisasi penilaian', function () {
    $db = createTestDb();
    $app = new App($db);
    $chair = ['id' => 1, 'username' => 'dm1', 'role' => 'chair', 'name' => 'Ketua Panel'];

    // Hanya DM1 yang difinalisasi
    $db->exec('UPDATE assessment_status SET is_finalized = 1 WHERE user_id = 1');

    try {
        $app->openVoting($chair);
        throw new RuntimeException('Harusnya melempar ApiError 409');
    } catch (ApiError $e) {
        assertEquals(409, $e->httpStatus);
    }
});

// 9. Satu DM tidak dapat voting dua kali
it('Test 9: Satu DM tidak dapat memberikan suara lebih dari sekali pada putaran yang sama', function () {
    $db = createTestDb();
    $app = new App($db);
    $db->exec('UPDATE assessment_status SET is_finalized = 1');

    $chair = ['id' => 1, 'username' => 'dm1', 'role' => 'chair', 'name' => 'Ketua Panel'];
    $app->openVoting($chair);

    // Vote pertama DM1
    $app->vote($chair, 1);

    // Vote kedua DM1 pada putaran yang sama harus gagal
    try {
        $app->vote($chair, 2);
        throw new RuntimeException('Harusnya melempar ApiError 409 untuk duplicate vote');
    } catch (ApiError $e) {
        assertEquals(409, $e->httpStatus);
    }
});

// 10. Mayoritas 2-1 menghasilkan kandidat mayoritas
it('Test 10: Voting dengan sebaran suara 2-1 menghasilkan status mayoritas sah', function () {
    $db = createTestDb();
    $app = new App($db);
    $db->exec('UPDATE assessment_status SET is_finalized = 1');

    $chair = ['id' => 1, 'username' => 'dm1', 'role' => 'chair', 'name' => 'Ketua Panel'];
    $dm2 = ['id' => 2, 'username' => 'dm2', 'role' => 'member', 'name' => 'Anggota 1'];
    $dm3 = ['id' => 3, 'username' => 'dm3', 'role' => 'member', 'name' => 'Anggota 2'];

    $app->openVoting($chair);

    // DM1 -> A, DM2 -> B, DM3 -> A (Sesuai contoh di instruksi)
    $app->vote($chair, 1);
    $app->vote($dm2, 2);
    $res3 = $app->vote($dm3, 1);

    assertTrue($res3['round_completed'], 'Putaran selesai');
    assertEquals('majority', $res3['evaluation']['status']);
    assertEquals(1, $res3['evaluation']['winner']['candidate_id']);
    assertEquals(2, $res3['evaluation']['winner']['votes']);
    assertClose(66.67, $res3['evaluation']['winner']['percentage'], 0.01);
});

// 11. Seri 1-1-1 memerlukan voting ulang
it('Test 11: Sebaran suara 1-1-1 menghasilkan status tie_revote', function () {
    $db = createTestDb();
    $app = new App($db);
    $db->exec('UPDATE assessment_status SET is_finalized = 1');

    $chair = ['id' => 1, 'username' => 'dm1', 'role' => 'chair', 'name' => 'Ketua Panel'];
    $dm2 = ['id' => 2, 'username' => 'dm2', 'role' => 'member', 'name' => 'Anggota 1'];
    $dm3 = ['id' => 3, 'username' => 'dm3', 'role' => 'member', 'name' => 'Anggota 2'];

    $app->openVoting($chair);

    // DM1 -> A, DM2 -> B, DM3 -> C
    $app->vote($chair, 1);
    $app->vote($dm2, 2);
    $res = $app->vote($dm3, 3);

    assertTrue($res['round_completed']);
    assertEquals('tie_revote', $res['evaluation']['status']);
    assertEquals(null, $res['evaluation']['winner']);
});

// 12. Putaran voting ulang mempunyai data terpisah
it('Test 12: Putaran voting ulang (round 2) menyimpan data terpisah dari round 1', function () {
    $db = createTestDb();
    $app = new App($db);
    $db->exec('UPDATE assessment_status SET is_finalized = 1');

    $chair = ['id' => 1, 'username' => 'dm1', 'role' => 'chair', 'name' => 'Ketua Panel'];
    $dm2 = ['id' => 2, 'username' => 'dm2', 'role' => 'member', 'name' => 'Anggota 1'];
    $dm3 = ['id' => 3, 'username' => 'dm3', 'role' => 'member', 'name' => 'Anggota 2'];

    // Round 1: Seri 1-1-1
    $app->openVoting($chair);
    $app->vote($chair, 1);
    $app->vote($dm2, 2);
    $app->vote($dm3, 3);

    // Buka Round 2
    $nextRound = $app->nextRoundVoting($chair);
    assertEquals(2, $nextRound['round_number']);

    // Berikan suara di Round 2: DM1 -> A, DM2 -> A, DM3 -> B
    $app->vote($chair, 1);
    $app->vote($dm2, 1);
    $res2 = $app->vote($dm3, 2);

    assertEquals(2, $res2['round_number']);
    assertEquals('majority', $res2['evaluation']['status']);
    assertEquals(1, $res2['evaluation']['winner']['candidate_id']);

    // Cek riwayat keputusan mencatat 2 putaran terpisah
    $history = $app->getDecisionsHistory();
    assertEquals(2, count($history['rounds']));
    assertEquals(1, $history['rounds'][0]['round_number']);
    assertEquals(2, $history['rounds'][1]['round_number']);
});

// 13. Hanya Ketua Panel yang boleh mengesahkan
it('Test 13: Anggota (member) dilarang mengesahkan keputusan', function () {
    $db = createTestDb();
    $app = new App($db);
    $db->exec('UPDATE assessment_status SET is_finalized = 1');

    $chair = ['id' => 1, 'username' => 'dm1', 'role' => 'chair', 'name' => 'Ketua Panel'];
    $dm2 = ['id' => 2, 'username' => 'dm2', 'role' => 'member', 'name' => 'Anggota 1'];
    $dm3 = ['id' => 3, 'username' => 'dm3', 'role' => 'member', 'name' => 'Anggota 2'];

    $app->openVoting($chair);
    $app->vote($chair, 1);
    $app->vote($dm2, 1);
    $app->vote($dm3, 2);

    try {
        $app->approveDecision($dm2, 'Saya anggota ingin mengesahkan');
        throw new RuntimeException('Harusnya melempar ApiError 403');
    } catch (ApiError $e) {
        assertEquals(403, $e->httpStatus);
    }
});

// 14. Hasil final bisa dilihat semua DM
it('Test 14: Setelah disahkan ketua, hasil final dapat diakses semua DM', function () {
    $db = createTestDb();
    $app = new App($db);
    $db->exec('UPDATE assessment_status SET is_finalized = 1');

    $chair = ['id' => 1, 'username' => 'dm1', 'role' => 'chair', 'name' => 'Ketua Panel'];
    $dm2 = ['id' => 2, 'username' => 'dm2', 'role' => 'member', 'name' => 'Anggota 1'];
    $dm3 = ['id' => 3, 'username' => 'dm3', 'role' => 'member', 'name' => 'Anggota 2'];

    $app->openVoting($chair);
    $app->vote($chair, 1);
    $app->vote($dm2, 1);
    $app->vote($dm3, 2);

    $app->approveDecision($chair, 'Konsensus mayoritas bulat menyetujui Kandidat A');

    $final = $app->getFinalDecision();
    assertTrue($final !== null);
    assertEquals('Kandidat A', $final['candidate_name']);
    assertEquals(2, (int)$final['total_votes']);
    assertEquals('Ketua Panel', $final['approved_by_name']);
});

// 15. Pengesahan tidak boleh dilakukan dua kali
it('Test 15: Keputusan tidak dapat disahkan dua kali untuk sesi yang sama', function () {
    $db = createTestDb();
    $app = new App($db);
    $db->exec('UPDATE assessment_status SET is_finalized = 1');

    $chair = ['id' => 1, 'username' => 'dm1', 'role' => 'chair', 'name' => 'Ketua Panel'];
    $dm2 = ['id' => 2, 'username' => 'dm2', 'role' => 'member', 'name' => 'Anggota 1'];
    $dm3 = ['id' => 3, 'username' => 'dm3', 'role' => 'member', 'name' => 'Anggota 2'];

    $app->openVoting($chair);
    $app->vote($chair, 1);
    $app->vote($dm2, 1);
    $app->vote($dm3, 2);

    $app->approveDecision($chair, 'Pengesahan pertama');

    try {
        $app->approveDecision($chair, 'Pengesahan kedua');
        throw new RuntimeException('Harusnya melempar ApiError 409');
    } catch (ApiError $e) {
        assertEquals(409, $e->httpStatus);
    }
});

// 16. Pengujian ranking seri pada SAW/Borda (average points sharing)
it('Test 16: Pengujian ranking seri pada Borda membagi poin rata-rata secara adil', function () {
    $calc = new DecisionService();
    $candidates = [
        ['id' => 1, 'name' => 'Kandidat A'],
        ['id' => 2, 'name' => 'Kandidat B'],
        ['id' => 3, 'name' => 'Kandidat C'],
    ];

    // Skenario: DM1 memberikan skor seri A dan B (90, 90, 70)
    // Posisi 1 dan 2 seri -> poin (3 + 2)/2 = 2.5 untuk A dan B, 1 untuk C
    // DM2 memberikan skor unik (90, 80, 70) -> A=3, B=2, C=1
    // DM3 memberikan skor unik (80, 90, 70) -> B=3, A=2, C=1
    $dmScores = [
        1 => [1 => 90.0, 2 => 90.0, 3 => 70.0],
        2 => [1 => 90.0, 2 => 80.0, 3 => 70.0],
        3 => [1 => 80.0, 2 => 90.0, 3 => 70.0],
    ];

    $borda = $calc->calculateBorda($dmScores, $candidates);
    $points = array_column($borda['rankings'], 'borda_points', 'candidate_id');

    // A: 2.5 + 3 + 2 = 7.5 poin
    // B: 2.5 + 2 + 3 = 7.5 poin
    // C: 1.0 + 1 + 1 = 3.0 poin
    // Total = 18.0 poin
    assertEquals(7.5, (float)$points[1], 'Poin Borda Seri A');
    assertEquals(7.5, (float)$points[2], 'Poin Borda Seri B');
    assertEquals(3.0, (float)$points[3], 'Poin Borda C');
    assertEquals(18.0, (float)$borda['total_points_distributed']);
});

// 17. Pemilih publik tidak boleh memblokir pembukaan voting
it('Test 17: Pemilih publik (voter) tidak dihitung dalam status penilaian panel', function () {
    $db = createTestDb();
    $app = new App($db);
    $hash = password_hash('password123', PASSWORD_BCRYPT);
    $db->exec("INSERT INTO users (id, username, name, role, password_hash) VALUES (4, 'voter1', 'Pemilih Satu', 'voter', '{$hash}')");
    $db->exec('UPDATE assessment_status SET is_finalized = 1');

    $status = $app->getAssessmentsStatus();
    assertEquals(3, $status['total_panelists'], 'Panelis hanya chair + member');
    assertTrue($status['all_finalized'], 'Voter tidak boleh membuat all_finalized=false');
    foreach ($status['panel'] as $p) {
        assertTrue(in_array($p['role'], ['chair', 'member'], true), 'Voter tidak boleh muncul di panel');
    }
});

// 18. Registrasi publik selalu menghasilkan role voter
it('Test 18: Registrasi publik memaksa role voter dan menolak username duplikat', function () {
    $db = createTestDb();
    $app = new App($db);

    $res = $app->register('Pemilih Baru', 'pemilihbaru', 'rahasia123', '127.0.0.1');
    assertEquals('voter', $res['role'], 'Role registrasi harus voter');

    $row = $db->query("SELECT role FROM users WHERE username = 'pemilihbaru'")->fetch(PDO::FETCH_ASSOC);
    assertEquals('voter', $row['role'], 'Role di database harus voter');

    try {
        $app->register('Pemilih Lain', 'pemilihbaru', 'rahasia123', '127.0.0.1');
        throw new RuntimeException('Username duplikat harus ditolak');
    } catch (ApiError $e) {
        assertEquals(409, $e->httpStatus);
    }
});

// 19. Snapshot electorate dibekukan saat voting dibuka
it('Test 19: Snapshot electorate dibekukan dan pendaftar setelahnya tidak berhak memilih', function () {
    $db = createTestDb();
    $app = new App($db);
    $db->exec('UPDATE assessment_status SET is_finalized = 1');

    $chair = ['id' => 1, 'username' => 'dm1', 'role' => 'chair', 'name' => 'Ketua Panel'];
    $app->openVoting($chair);

    $snapshotCount = (int)$db->query('SELECT COUNT(*) FROM session_voters')->fetchColumn();
    assertEquals(3, $snapshotCount, 'Snapshot awal hanya chair + member');

    // Registrasi setelah voting dibuka
    $late = $app->register('Pemilih Terlambat', 'terlambat', 'rahasia123', '127.0.0.1');
    $lateUser = ['id' => $late['id'], 'username' => 'terlambat', 'role' => 'voter', 'name' => 'Pemilih Terlambat'];

    $snapshotAfter = (int)$db->query('SELECT COUNT(*) FROM session_voters')->fetchColumn();
    assertEquals(3, $snapshotAfter, 'Snapshot tidak boleh bertambah setelah voting dibuka');

    try {
        $app->vote($lateUser, 1);
        throw new RuntimeException('Pendaftar setelah snapshot harus ditolak 403');
    } catch (ApiError $e) {
        assertEquals(403, $e->httpStatus);
    }
});

// 20. Voter di dalam snapshot tetap bisa memilih
it('Test 20: Voter yang terdaftar sebelum voting dibuka dapat memberikan suara', function () {
    $db = createTestDb();
    $app = new App($db);
    $hash = password_hash('password123', PASSWORD_BCRYPT);
    $db->exec("INSERT INTO users (id, username, name, role, password_hash) VALUES (4, 'voter1', 'Pemilih Satu', 'voter', '{$hash}')");
    $db->exec('UPDATE assessment_status SET is_finalized = 1');

    $chair = ['id' => 1, 'username' => 'dm1', 'role' => 'chair', 'name' => 'Ketua Panel'];
    $app->openVoting($chair);

    $snapshotCount = (int)$db->query('SELECT COUNT(*) FROM session_voters')->fetchColumn();
    assertEquals(4, $snapshotCount, 'Snapshot harus memuat chair, member, dan voter terdaftar');

    $voter = ['id' => 4, 'username' => 'voter1', 'role' => 'voter', 'name' => 'Pemilih Satu'];
    $res = $app->vote($voter, 1);
    assertEquals(1, $res['votes_cast_in_round']);
    assertTrue($res['has_voted']);
});

// 21. Borda hanya mengagregasi panel, bukan voter
it('Test 21: Agregasi Borda mengabaikan voter tanpa penilaian', function () {
    $db = createTestDb();
    $app = new App($db);
    $hash = password_hash('password123', PASSWORD_BCRYPT);
    $db->exec("INSERT INTO users (id, username, name, role, password_hash) VALUES (4, 'voter1', 'Pemilih Satu', 'voter', '{$hash}')");
    $db->exec('UPDATE assessment_status SET is_finalized = 1');

    $borda = $app->calculateBorda();
    $points = array_column($borda['rankings'], 'borda_points', 'candidate_id');
    assertEquals(8.0, (float)$points[1], 'Poin Borda A tetap sesuai Excel');
    assertEquals(6.0, (float)$points[2], 'Poin Borda B tetap sesuai Excel');
    assertEquals(4.0, (float)$points[3], 'Poin Borda C tetap sesuai Excel');
    assertEquals(3, count($borda['dm_breakdown']), 'Breakdown hanya 3 panelis');
    assertTrue(!array_key_exists(4, $borda['dm_breakdown']), 'Voter tidak boleh masuk breakdown Borda');
});

echo PHP_EOL . "=== RINGKASAN HASIL TEST ===" . PHP_EOL;
echo "Total Lulus : {$passed}" . PHP_EOL;
echo "Total Gagal : {$failed}" . PHP_EOL;

if ($failed > 0) {
    exit(1);
}
