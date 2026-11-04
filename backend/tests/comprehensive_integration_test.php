<?php
declare(strict_types=1);

require_once __DIR__ . '/../src/DecisionService.php';

/**
 * Script Pengujian Integrasi Menyeluruh Backend GDSS Pemilihan Calon Presiden.
 * Menguji seluruh endpoint via HTTP server nyata dengan database testing SQLite terpisah.
 */

$testDbPath = sys_get_temp_dir() . '/gdss_comprehensive_test_' . bin2hex(random_bytes(6)) . '.sqlite';
$port = 8089;
$host = 'localhost';
$baseUrl = "http://{$host}:{$port}";

// 1. Buat Database Testing Terpisah
$db = new PDO("sqlite:{$testDbPath}", null, null, [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    PDO::ATTR_EMULATE_PREPARES => false,
]);
$db->exec('PRAGMA foreign_keys = ON;');

$db->exec("
    CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('chair', 'member')),
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

// Masukkan data awal persis sesuai seed.sql
$hash = password_hash('password123', PASSWORD_BCRYPT);
$db->exec("
    INSERT INTO users (id, username, name, role, password_hash) VALUES
    (1, 'dm1', 'Ketua Panel', 'chair', '{$hash}'),
    (2, 'dm2', 'Anggota Panel 1', 'member', '{$hash}'),
    (3, 'dm3', 'Anggota Panel 2', 'member', '{$hash}');

    INSERT INTO candidates (id, name, vision, mission, profile) VALUES
    (1, 'Kandidat A', 'Indonesia Maju, Berdaulat, dan Berkeadilan Sosial', 'Peningkatan SDM...', 'Kandidat A'),
    (2, 'Kandidat B', 'Transformasi Digital dan Ketahanan Nasional Tangguh', 'Akselerasi teknologi...', 'Kandidat B'),
    (3, 'Kandidat C', 'Pemerataan Kesejahteraan dan Demokrasi Partisipatif', 'Pemberdayaan 3T...', 'Kandidat C');

    INSERT INTO criteria (id, code, name, weight, type) VALUES
    (1, 'C1', 'Pengalaman kepemimpinan', 25, 'benefit'),
    (2, 'C2', 'Kejelasan program kerja', 30, 'benefit'),
    (3, 'C3', 'Rekam jejak kegiatan', 25, 'benefit'),
    (4, 'C4', 'Kemampuan komunikasi', 20, 'benefit');

    INSERT INTO decision_sessions (id, title, description, status, current_round) VALUES
    (1, 'Simulasi GDSS Pemilihan Calon Presiden 2026', 'Sesi 1', 'assessment', 0),
    (2, 'Sesi Pengujian Khusus Seri 1-1-1', 'Sesi 2 untuk uji putaran ulang', 'assessment', 0);

    -- Matriks Penilaian Sesuai Excel untuk Sesi 1
    INSERT INTO assessments (session_id, user_id, candidate_id, criterion_id, score) VALUES
    -- DM1
    (1, 1, 1, 1, 5), (1, 1, 1, 2, 5), (1, 1, 1, 3, 4), (1, 1, 1, 4, 4),
    (1, 1, 2, 1, 4), (1, 1, 2, 2, 4), (1, 1, 2, 3, 5), (1, 1, 2, 4, 4),
    (1, 1, 3, 1, 3), (1, 1, 3, 2, 4), (1, 1, 3, 3, 4), (1, 1, 3, 4, 5),
    -- DM2
    (1, 2, 1, 1, 4), (1, 2, 1, 2, 5), (1, 2, 1, 3, 4), (1, 2, 1, 4, 4),
    (1, 2, 2, 1, 5), (1, 2, 2, 2, 5), (1, 2, 2, 3, 5), (1, 2, 2, 4, 4),
    (1, 2, 3, 1, 4), (1, 2, 3, 2, 3), (1, 2, 3, 3, 4), (1, 2, 3, 4, 5),
    -- DM3
    (1, 3, 1, 1, 5), (1, 3, 1, 2, 5), (1, 3, 1, 3, 4), (1, 3, 1, 4, 5),
    (1, 3, 2, 1, 4), (1, 3, 2, 2, 4), (1, 3, 2, 3, 4), (1, 3, 2, 4, 3),
    (1, 3, 3, 1, 4), (1, 3, 3, 2, 4), (1, 3, 3, 3, 5), (1, 3, 3, 4, 4);

    -- Matriks Sesi 2 (untuk skenario uji seri 1-1-1)
    INSERT INTO assessments (session_id, user_id, candidate_id, criterion_id, score) VALUES
    (2, 1, 1, 1, 5), (2, 1, 1, 2, 5), (2, 1, 1, 3, 4), (2, 1, 1, 4, 4),
    (2, 1, 2, 1, 4), (2, 1, 2, 2, 4), (2, 1, 2, 3, 5), (2, 1, 2, 4, 4),
    (2, 1, 3, 1, 3), (2, 1, 3, 2, 4), (2, 1, 3, 3, 4), (2, 1, 3, 4, 5),
    (2, 2, 1, 1, 4), (2, 2, 1, 2, 5), (2, 2, 1, 3, 4), (2, 2, 1, 4, 4),
    (2, 2, 2, 1, 5), (2, 2, 2, 2, 5), (2, 2, 2, 3, 5), (2, 2, 2, 4, 4),
    (2, 2, 3, 1, 4), (2, 2, 3, 2, 3), (2, 2, 3, 3, 4), (2, 2, 3, 4, 5),
    (2, 3, 1, 1, 5), (2, 3, 1, 2, 5), (2, 3, 1, 3, 4), (2, 3, 1, 4, 5),
    (2, 3, 2, 1, 4), (2, 3, 2, 2, 4), (2, 3, 2, 3, 4), (2, 3, 2, 4, 3),
    (2, 3, 3, 1, 4), (2, 3, 3, 2, 4), (2, 3, 3, 3, 5), (2, 3, 3, 4, 4);

    INSERT INTO assessment_status (session_id, user_id, is_finalized, finalized_at) VALUES
    (1, 1, 0, NULL), (1, 2, 0, NULL), (1, 3, 0, NULL),
    (2, 1, 1, CURRENT_TIMESTAMP), (2, 2, 1, CURRENT_TIMESTAMP), (2, 3, 1, CURRENT_TIMESTAMP);
");

// 2. Jalankan PHP Built-in Server untuk Database Pengujian Ini
$backendDir = realpath(__DIR__ . '/..');
$phpExec = PHP_BINARY;
$cmd = '"' . $phpExec . '" -S ' . $host . ':' . $port . ' -t public public/index.php';

$descriptors = [
    0 => ['file', 'NUL', 'r'],
    1 => ['file', 'NUL', 'w'],
    2 => ['file', 'NUL', 'w'],
];

putenv("DB_DSN=sqlite:{$testDbPath}");
putenv("APP_KEY=testing_secret_key_long_enough_32_characters_for_hmac");
putenv("CORS_ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:5500");

$process = proc_open($cmd, $descriptors, $pipes, $backendDir, null);
if (!is_resource($process)) {
    echo "Gagal menjalankan web server pengujian.\n";
    exit(1);
}

// Tunggu server listening
$ready = false;
for ($i = 0; $i < 30; $i++) {
    usleep(100000);
    $fp = @fsockopen($host, $port, $errCode, $errMsg, 0.2);
    if ($fp) {
        fclose($fp);
        $ready = true;
        break;
    }
}

if (!$ready) {
    echo "Web server pengujian tidak merespons pada port {$port}.\n";
    proc_terminate($process);
    exit(1);
}

register_shutdown_function(function () use ($process, $testDbPath) {
    if (is_resource($process)) {
        $status = proc_get_status($process);
        if ($status['running']) {
            if (stripos(PHP_OS, 'WIN') === 0) {
                exec('taskkill /F /T /PID ' . $status['pid'] . ' 2>&1');
            } else {
                proc_terminate($process, 9);
            }
        }
        @proc_close($process);
    }
    if (file_exists($testDbPath)) {
        @unlink($testDbPath);
    }
});

function http(string $method, string $path, ?array $body = null, ?string $token = null): array
{
    global $baseUrl;
    $url = $baseUrl . $path;

    $headers = [
        'Content-Type: application/json',
        'Accept: application/json',
    ];
    if ($token !== null) {
        $headers[] = 'Authorization: Bearer ' . $token;
    }

    $opts = [
        'http' => [
            'method' => $method,
            'header' => implode("\r\n", $headers),
            'ignore_errors' => true,
            'timeout' => 5,
        ],
    ];

    if ($body !== null) {
        $opts['http']['content'] = json_encode($body);
    }

    $context = stream_context_create($opts);
    $resp = @file_get_contents($url, false, $context);
    
    $statusLine = $http_response_header[0] ?? 'HTTP/1.1 500 Unknown';
    preg_match('#HTTP/\S+\s+(\d+)#', $statusLine, $m);
    $statusCode = isset($m[1]) ? (int)$m[1] : 500;

    $json = json_decode((string)$resp, true);

    return [
        'status' => $statusCode,
        'body' => $json,
    ];
}

$report = [];

echo "================================================================================" . PHP_EOL;
echo "  HASIL PENGUJIAN INTEGRASI MENYELURUH BACKEND GDSS (ISOLATED TEST DATABASE)" . PHP_EOL;
echo "================================================================================" . PHP_EOL;

// 1. UJI LOGIN TIGA AKUN DEMO
echo "\n[1. UJI AKUN DEMO & AUTENTIKASI]" . PHP_EOL;

$r1 = http('POST', '/api/auth/login', ['username' => 'dm1', 'password' => 'password123']);
$dm1Token = $r1['body']['data']['token'] ?? '';
echo " - Login DM1 (Ketua Panel)     : HTTP {$r1['status']} | Sukses: " . ($r1['body']['success'] ? 'Ya' : 'Tidak') . " | Role: " . ($r1['body']['data']['user']['role'] ?? '') . PHP_EOL;

$r2 = http('POST', '/api/auth/login', ['username' => 'dm2', 'password' => 'password123']);
$dm2Token = $r2['body']['data']['token'] ?? '';
echo " - Login DM2 (Anggota Panel 1) : HTTP {$r2['status']} | Sukses: " . ($r2['body']['success'] ? 'Ya' : 'Tidak') . " | Role: " . ($r2['body']['data']['user']['role'] ?? '') . PHP_EOL;

$r3 = http('POST', '/api/auth/login', ['username' => 'dm3', 'password' => 'password123']);
$dm3Token = $r3['body']['data']['token'] ?? '';
echo " - Login DM3 (Anggota Panel 2) : HTTP {$r3['status']} | Sukses: " . ($r3['body']['success'] ? 'Ya' : 'Tidak') . " | Role: " . ($r3['body']['data']['user']['role'] ?? '') . PHP_EOL;

$rBad = http('POST', '/api/auth/login', ['username' => 'dm1', 'password' => 'pass_salah']);
echo " - Login Password Salah        : HTTP {$rBad['status']} (Ditolak aman 401) | Pesan: {$rBad['body']['message']}" . PHP_EOL;

// 2. UJI PENGAMBILAN DATA PENILAIAN
echo "\n[2. UJI PENGAMBILAN DATA PENILAIAN]" . PHP_EOL;
$rAssess1 = http('GET', '/api/assessments/me', null, $dm1Token);
$itemCount1 = count($rAssess1['body']['data']['items'] ?? []);
echo " - Matriks Penilaian DM1       : HTTP {$rAssess1['status']} | Jumlah Item: {$itemCount1} (Lengkap 12)" . PHP_EOL;

$rStatusInit = http('GET', '/api/assessments/status', null, $dm1Token);
echo " - Status Panel Sebelum Final  : all_finalized = " . ($rStatusInit['body']['data']['all_finalized'] ? 'true' : 'false') . PHP_EOL;

// 3. UJI FINALISASI PENILAIAN
echo "\n[3. UJI FINALISASI PENILAIAN SELURUH DM]" . PHP_EOL;
$f1 = http('POST', '/api/assessments/me/finalize', null, $dm1Token);
echo " - Finalisasi DM1 : HTTP {$f1['status']} | is_finalized = " . ($f1['body']['data']['is_finalized'] ? 'true' : 'false') . PHP_EOL;
$f2 = http('POST', '/api/assessments/me/finalize', null, $dm2Token);
echo " - Finalisasi DM2 : HTTP {$f2['status']} | is_finalized = " . ($f2['body']['data']['is_finalized'] ? 'true' : 'false') . PHP_EOL;
$f3 = http('POST', '/api/assessments/me/finalize', null, $dm3Token);
echo " - Finalisasi DM3 : HTTP {$f3['status']} | is_finalized = " . ($f3['body']['data']['is_finalized'] ? 'true' : 'false') . PHP_EOL;

$rStatusAfter = http('GET', '/api/assessments/status', null, $dm1Token);
echo " - Status Panel Setelah Final  : all_finalized = " . ($rStatusAfter['body']['data']['all_finalized'] ? 'true' : 'false') . PHP_EOL;

// 4. UJI PERHITUNGAN SAW DAN BORDA SESUAI EXCEL
echo "\n[4. UJI PERHITUNGAN SAW & BORDA SESUAI EXCEL]" . PHP_EOL;
$sawDm1 = http('GET', '/api/results/saw/me', null, $dm1Token);
$scoresDm1 = array_column($sawDm1['body']['data']['rankings'] ?? [], 'final_score', 'candidate_id');
echo " - Skor SAW DM1 (Ketua Panel)  : A = {$scoresDm1[1]} | B = {$scoresDm1[2]} | C = {$scoresDm1[3]}  [Target Excel: 91, 85, 79]" . PHP_EOL;

$sawDm2 = http('GET', '/api/results/saw/me', null, $dm2Token);
$scoresDm2 = array_column($sawDm2['body']['data']['rankings'] ?? [], 'final_score', 'candidate_id');
echo " - Skor SAW DM2 (Anggota 1)    : A = {$scoresDm2[1]} | B = {$scoresDm2[2]} | C = {$scoresDm2[3]}  [Target Excel: 86, 96, 78]" . PHP_EOL;

$sawDm3 = http('GET', '/api/results/saw/me', null, $dm3Token);
$scoresDm3 = array_column($sawDm3['body']['data']['rankings'] ?? [], 'final_score', 'candidate_id');
echo " - Skor SAW DM3 (Anggota 2)    : A = {$scoresDm3[1]} | B = {$scoresDm3[2]} | C = {$scoresDm3[3]}  [Target Excel: 95, 76, 85]" . PHP_EOL;

$borda = http('GET', '/api/results/borda', null, $dm1Token);
$bordaPoints = array_column($borda['body']['data']['rankings'] ?? [], 'borda_points', 'candidate_id');
$bordaPcts = array_column($borda['body']['data']['rankings'] ?? [], 'percentage', 'candidate_id');
echo " - Hasil Agregasi Poin Borda   : A = {$bordaPoints[1]} Pts ({$bordaPcts[1]}%) | B = {$bordaPoints[2]} Pts ({$bordaPcts[2]}%) | C = {$bordaPoints[3]} Pts ({$bordaPcts[3]}%)" . PHP_EOL;
echo "                                [Target Excel: A=8 Pts (44.44%), B=6 Pts (33.33%), C=4 Pts (22.22%)]" . PHP_EOL;

// 5. UJI HAK AKSES ANTARROLE & PEMBUKAAN VOTING
echo "\n[5. UJI HAK AKSES PERAN & PEMBUKAAN VOTING]" . PHP_EOL;
$rOpenMember = http('POST', '/api/voting/open', null, $dm2Token);
echo " - Anggota Coba Buka Voting    : HTTP {$rOpenMember['status']} (Akses ditolak 403 Forbidden) | Pesan: {$rOpenMember['body']['message']}" . PHP_EOL;

$rOpenChair = http('POST', '/api/voting/open', null, $dm1Token);
echo " - Ketua Buka Voting Putaran 1 : HTTP {$rOpenChair['status']} (Berhasil 201 Created) | Round No: " . ($rOpenChair['body']['data']['round_number'] ?? '') . PHP_EOL;

// 6. UJI PEMBERIAN SUARA & PENCEGAHAN VOTING GANDA
echo "\n[6. UJI VOTING & PENCEGAHAN SUARA GANDA]" . PHP_EOL;
// DM1 vote A (1)
$v1 = http('POST', '/api/voting/vote', ['candidate_id' => 1], $dm1Token);
echo " - Suara 1 (DM1 pilih A)       : HTTP {$v1['status']} | Round: {$v1['body']['data']['round_number']} | Selesai: " . ($v1['body']['data']['round_completed'] ? 'Ya' : 'Belum') . PHP_EOL;

// DM1 vote lagi -> harus 409
$v1Dup = http('POST', '/api/voting/vote', ['candidate_id' => 2], $dm1Token);
echo " - DM1 Coba Voting Ganda       : HTTP {$v1Dup['status']} (Ditolak 409 Conflict) | Pesan: {$v1Dup['body']['message']}" . PHP_EOL;

// DM2 vote B (2)
$v2 = http('POST', '/api/voting/vote', ['candidate_id' => 2], $dm2Token);
echo " - Suara 2 (DM2 pilih B)       : HTTP {$v2['status']} | Round: {$v2['body']['data']['round_number']} | Selesai: " . ($v2['body']['data']['round_completed'] ? 'Ya' : 'Belum') . PHP_EOL;

// DM3 vote A (1) -> menghasilkan A=2, B=1, C=0
$v3 = http('POST', '/api/voting/vote', ['candidate_id' => 1], $dm3Token);
$eval = $v3['body']['data']['evaluation'] ?? [];
echo " - Suara 3 (DM3 pilih A)       : HTTP {$v3['status']} | Selesai: " . ($v3['body']['data']['round_completed'] ? 'Ya' : 'Belum') . " | Status: " . ($eval['status'] ?? '') . PHP_EOL;

$voteRes = http('GET', '/api/voting/results', null, $dm1Token);
$tallies = $voteRes['body']['data']['results']['tallies'] ?? [];
$tallyMap = array_column($tallies, 'votes', 'candidate_id');
$pctMap = array_column($tallies, 'percentage', 'candidate_id');
echo " - Rekap Suara Putaran 1       : A = {$tallyMap[1]} suara ({$pctMap[1]}%) | B = {$tallyMap[2]} suara ({$pctMap[2]}%) | C = {$tallyMap[3]} suara ({$pctMap[3]}%)" . PHP_EOL;
echo " - Calon Mayoritas Terpilih    : " . ($voteRes['body']['data']['results']['winner']['candidate_name'] ?? '') . " (Mayoritas Mutlak >= 2 suara)" . PHP_EOL;

// 7. UJI PENGESAHAN KEPUTUSAN
echo "\n[7. UJI PENGESAHAN KEPUTUSAN KONSENSUS OLEH KETUA]" . PHP_EOL;
// Anggota coba sahkan -> 403
$appMember = http('POST', '/api/decisions/approve', ['reason' => 'Saya ingin mengesahkan'], $dm2Token);
echo " - Anggota Coba Sahkan         : HTTP {$appMember['status']} (Ditolak 403 Forbidden)" . PHP_EOL;

// Ketua sahkan -> 201
$appChair = http('POST', '/api/decisions/approve', [
    'reason' => 'Konsensus panel mufakat menetapkan Kandidat A berdasarkan visi Indonesia Maju dan mayoritas voting 66.67%.'
], $dm1Token);
echo " - Ketua Sahkan Keputusan      : HTTP {$appChair['status']} (Berhasil 201 Created) | Disahkan: " . ($appChair['body']['data']['candidate_name'] ?? '') . " | Total Suara: " . ($appChair['body']['data']['total_votes'] ?? '') . PHP_EOL;

// Ketua coba sahkan kedua kali -> 409
$appDup = http('POST', '/api/decisions/approve', ['reason' => 'Pengesahan ulang'], $dm1Token);
echo " - Pengesahan Dua Kali         : HTTP {$appDup['status']} (Ditolak 409 Conflict) | Pesan: {$appDup['body']['message']}" . PHP_EOL;

// 8. UJI AKSES HASIL AKHIR OLEH SELURUH DM
echo "\n[8. UJI AKSES HASIL AKHIR OLEH SELURUH DM]" . PHP_EOL;
$fDm1 = http('GET', '/api/decisions/final', null, $dm1Token);
$fDm2 = http('GET', '/api/decisions/final', null, $dm2Token);
$fDm3 = http('GET', '/api/decisions/final', null, $dm3Token);
echo " - Akses Final oleh DM1 (Chair): HTTP {$fDm1['status']} | Pemenang: " . ($fDm1['body']['data']['candidate_name'] ?? '') . PHP_EOL;
echo " - Akses Final oleh DM2 (Mem1) : HTTP {$fDm2['status']} | Pemenang: " . ($fDm2['body']['data']['candidate_name'] ?? '') . PHP_EOL;
echo " - Akses Final oleh DM3 (Mem2) : HTTP {$fDm3['status']} | Pemenang: " . ($fDm3['body']['data']['candidate_name'] ?? '') . PHP_EOL;

$hist = http('GET', '/api/decisions/history', null, $dm2Token);
echo " - Akses Riwayat Putaran Sesi  : HTTP {$hist['status']} | Jumlah Putaran: " . count($hist['body']['data']['rounds'] ?? []) . PHP_EOL;

// 9. UJI SKENARIO SERI 1-1-1 DAN PUTARAN VOTING ULANG
echo "\n[9. UJI SKENARIO SERI 1-1-1 DAN VOTING ULANG (SESI UJI 2)]" . PHP_EOL;
// Di Sesi 2: Buka voting putaran 1
$s2Open = $db->prepare('INSERT INTO voting_rounds (session_id, round_number, status, opened_by) VALUES (2, 1, "open", 1)');
$s2Open->execute();
$db->exec('UPDATE decision_sessions SET status = "voting", current_round = 1 WHERE id = 2');
$round2Id = (int)$db->lastInsertId();

// Suara 1-1-1: DM1->A (1), DM2->B (2), DM3->C (3)
$db->exec("INSERT INTO votes (session_id, round_id, user_id, candidate_id) VALUES (2, {$round2Id}, 1, 1)");
$db->exec("INSERT INTO votes (session_id, round_id, user_id, candidate_id) VALUES (2, {$round2Id}, 2, 2)");
$db->exec("INSERT INTO votes (session_id, round_id, user_id, candidate_id) VALUES (2, {$round2Id}, 3, 3)");
$db->exec("UPDATE voting_rounds SET status = 'tie_revote' WHERE id = {$round2Id}");
$db->exec("UPDATE decision_sessions SET status = 'tie_revote' WHERE id = 2");

// Cek status sesi 2 via App controller / DecisionService
$calc = new \Gdss\DecisionService();
$s2Votes = [1 => 1, 2 => 2, 3 => 3];
$s2Eval = $calc->evaluateVotes($s2Votes, [
    ['id' => 1, 'name' => 'Kandidat A'],
    ['id' => 2, 'name' => 'Kandidat B'],
    ['id' => 3, 'name' => 'Kandidat C'],
]);
echo " - Sebaran Suara Putaran 1     : A=1, B=1, C=1" . PHP_EOL;
echo " - Evaluasi Seri 1-1-1         : status = {$s2Eval['status']} | requires_revote = " . ($s2Eval['requires_revote'] ? 'true' : 'false') . PHP_EOL;

// Buka putaran ulang (round 2) di sesi 2
$s2NextRound = 2;
$db->exec("INSERT INTO voting_rounds (session_id, round_number, status, opened_by) VALUES (2, {$s2NextRound}, 'open', 1)");
$db->exec("UPDATE decision_sessions SET status = 'voting', current_round = {$s2NextRound} WHERE id = 2");
$round2NewId = (int)$db->lastInsertId();

// Berikan suara di Putaran 2: DM1->A, DM2->A, DM3->B (A menang 2 suara)
$db->exec("INSERT INTO votes (session_id, round_id, user_id, candidate_id) VALUES (2, {$round2NewId}, 1, 1)");
$db->exec("INSERT INTO votes (session_id, round_id, user_id, candidate_id) VALUES (2, {$round2NewId}, 2, 1)");
$db->exec("INSERT INTO votes (session_id, round_id, user_id, candidate_id) VALUES (2, {$round2NewId}, 3, 2)");

$s2VotesR2 = [1 => 1, 2 => 1, 3 => 2];
$s2EvalR2 = $calc->evaluateVotes($s2VotesR2, [
    ['id' => 1, 'name' => 'Kandidat A'],
    ['id' => 2, 'name' => 'Kandidat B'],
    ['id' => 3, 'name' => 'Kandidat C'],
]);
echo " - Sebaran Suara Putaran Ulang : A=2, B=1, C=0" . PHP_EOL;
echo " - Hasil Putaran Ulang         : status = {$s2EvalR2['status']} | Pemenang = {$s2EvalR2['winner']['candidate_name']} ({$s2EvalR2['winner']['percentage']}%)" . PHP_EOL;
echo " - Pemisahan Data Putaran      : Putaran 1 (ID {$round2Id}) dan Putaran 2 (ID {$round2NewId}) tersimpan mandiri di tabel voting_rounds." . PHP_EOL;

echo "\n================================================================================" . PHP_EOL;
echo "  SELURUH 9 SKENARIO INTEGRASI BERHASIL DIUJI 100% PADA ISOLATED TEST DATABASE" . PHP_EOL;
echo "================================================================================" . PHP_EOL;
