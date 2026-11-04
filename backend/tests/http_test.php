<?php
declare(strict_types=1);

/**
 * End-to-end HTTP integration test suite untuk REST API GDSS Pemilihan Calon Presiden.
 * Menjalankan server HTTP built-in PHP dengan database SQLite terisolasi,
 * lalu menguji seluruh endpoint /api dengan request HTTP nyata.
 */

$testDbPath = sys_get_temp_dir() . '/gdss_http_test_' . bin2hex(random_bytes(6)) . '.sqlite';
$port = rand(8085, 8095);
$host = 'localhost';
$baseUrl = "http://{$host}:{$port}";

$db = new PDO("sqlite:{$testDbPath}", null, null, [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    PDO::ATTR_EMULATE_PREPARES => false,
]);
$db->exec('PRAGMA foreign_keys = ON;');

// Buat Skema Relasional Lengkap
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

// Masukkan data awal seed
$hash = password_hash('password123', PASSWORD_BCRYPT);
$db->exec("
    INSERT INTO users (id, username, name, role, password_hash) VALUES
    (1, 'dm1', 'Ketua Panel', 'chair', '{$hash}'),
    (2, 'dm2', 'Anggota Panel 1', 'member', '{$hash}'),
    (3, 'dm3', 'Anggota Panel 2', 'member', '{$hash}');

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

    -- Matriks Penilaian Sesuai Excel
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

// Jalankan web server PHP built-in di background
$backendDir = realpath(__DIR__ . '/..');
$phpExec = PHP_BINARY;
$cmd = "\"{$phpExec}\" -S {$host}:{$port} -t public public/index.php";

$descriptors = [
    0 => ['file', 'NUL', 'r'],
    1 => ['file', 'NUL', 'w'],
    2 => ['file', 'NUL', 'w'],
];

putenv("DB_DSN=sqlite:{$testDbPath}");
putenv("APP_KEY=test_secret_key_minimum_32_characters_for_hmac_test_suite_long");
putenv("CORS_ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:5500");

$process = proc_open($cmd, $descriptors, $pipes, $backendDir, null);
if (!is_resource($process)) {
    echo "Gagal menjalankan web server PHP built-in.\n";
    exit(1);
}

// Tunggu server siap (polling port)
$ready = false;
for ($i = 0; $i < 40; $i++) {
    usleep(100000); // 100ms
    $fp = @fsockopen($host, $port, $errCode, $errMsg, 0.2);
    if ($fp) {
        fclose($fp);
        $ready = true;
        break;
    }
}

if (!$ready) {
    echo "Web server tidak merespons dalam waktu 4 detik.\n";
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

// Helper HTTP Client
function apiRequest(string $method, string $path, ?array $body = null, ?string $token = null): array
{
    global $baseUrl;
    $url = $baseUrl . $path;

    $headers = [
        'Content-Type: application/json',
        'Accept: application/json',
        'Origin: http://localhost:3000',
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
    $responseBody = @file_get_contents($url, false, $context);
    
    $statusLine = $http_response_header[0] ?? 'HTTP/1.1 500 Unknown';
    preg_match('#HTTP/\S+\s+(\d+)#', $statusLine, $m);
    $statusCode = isset($m[1]) ? (int)$m[1] : 500;

    $json = json_decode((string)$responseBody, true);

    return [
        'status' => $statusCode,
        'body' => $json,
        'raw' => $responseBody,
        'headers' => $http_response_header ?? [],
    ];
}

$httpPassed = 0;
$httpFailed = 0;

function testHttp(string $name, callable $fn): void
{
    global $httpPassed, $httpFailed;
    try {
        $fn();
        $httpPassed++;
        echo " [HTTP PASS] " . $name . PHP_EOL;
    } catch (\Throwable $e) {
        $httpFailed++;
        echo " [HTTP FAIL] " . $name . " -> " . $e->getMessage() . PHP_EOL;
    }
}

echo "=== MENJALANKAN HTTP INTEGRATION TEST LIVE WEB SERVER ===" . PHP_EOL;

// 1. CORS Preflight
testHttp('CORS: OPTIONS preflight merespons 204 dengan header CORS yang diizinkan', function () {
    $res = apiRequest('OPTIONS', '/api/candidates');
    if ($res['status'] !== 204) {
        throw new RuntimeException("Expected status 204, got {$res['status']}");
    }
});

// 2. Login Sukses & Token Bearer
$dm1Token = '';
$dm2Token = '';
$dm3Token = '';

testHttp('Auth: POST /api/auth/login menghasilkan token Bearer dan objek pengguna', function () use (&$dm1Token, &$dm2Token, &$dm3Token) {
    $res1 = apiRequest('POST', '/api/auth/login', ['username' => 'dm1', 'password' => 'password123']);
    if ($res1['status'] !== 200 || !($res1['body']['success'] ?? false)) {
        throw new RuntimeException("Login dm1 gagal: " . json_encode($res1['body']));
    }
    $dm1Token = $res1['body']['data']['token'];

    $res2 = apiRequest('POST', '/api/auth/login', ['username' => 'dm2', 'password' => 'password123']);
    $dm2Token = $res2['body']['data']['token'];

    $res3 = apiRequest('POST', '/api/auth/login', ['username' => 'dm3', 'password' => 'password123']);
    $dm3Token = $res3['body']['data']['token'];

    if (empty($dm1Token) || empty($dm2Token) || empty($dm3Token)) {
        throw new RuntimeException('Gagal mendapatkan token untuk ketiga DM');
    }
});

// 3. Login Gagal
testHttp('Auth: POST /api/auth/login dengan password salah menghasilkan status 401', function () {
    $res = apiRequest('POST', '/api/auth/login', ['username' => 'dm1', 'password' => 'wrong_password']);
    if ($res['status'] !== 401 || ($res['body']['success'] ?? true) !== false) {
        throw new RuntimeException("Expected status 401, got {$res['status']}");
    }
});

// 4. GET /api/auth/me
testHttp('Auth: GET /api/auth/me mengembalikan profil pengguna sesuai token', function () use (&$dm1Token) {
    $res = apiRequest('GET', '/api/auth/me', null, $dm1Token);
    if ($res['status'] !== 200 || $res['body']['data']['username'] !== 'dm1') {
        throw new RuntimeException("Expected dm1 profile, got " . json_encode($res['body']));
    }
});

// 5. GET /api/candidates
testHttp('Master: GET /api/candidates mengembalikan daftar 3 kandidat presiden', function () use (&$dm1Token) {
    $res = apiRequest('GET', '/api/candidates', null, $dm1Token);
    if ($res['status'] !== 200 || count($res['body']['data']) !== 3) {
        throw new RuntimeException("Expected 3 candidates, got " . json_encode($res['body']));
    }
});

// 6. GET /api/candidates/{id}
testHttp('Master: GET /api/candidates/1 mengembalikan detail Kandidat A', function () use (&$dm1Token) {
    $res = apiRequest('GET', '/api/candidates/1', null, $dm1Token);
    if ($res['status'] !== 200 || $res['body']['data']['name'] !== 'Kandidat A') {
        throw new RuntimeException("Expected Kandidat A, got " . json_encode($res['body']));
    }
});

// 7. GET /api/criteria
testHttp('Master: GET /api/criteria mengembalikan 4 kriteria dengan bobot total 100', function () use (&$dm1Token) {
    $res = apiRequest('GET', '/api/criteria', null, $dm1Token);
    if ($res['status'] !== 200 || count($res['body']['data']) !== 4) {
        throw new RuntimeException("Expected 4 criteria, got " . json_encode($res['body']));
    }
    $totalWeight = array_sum(array_column($res['body']['data'], 'weight'));
    if ($totalWeight !== 100) {
        throw new RuntimeException("Expected total weight 100, got {$totalWeight}");
    }
});

// 8. GET /api/assessments/me
testHttp('Assessments: GET /api/assessments/me mengembalikan draft penilaian DM', function () use (&$dm1Token) {
    $res = apiRequest('GET', '/api/assessments/me', null, $dm1Token);
    if ($res['status'] !== 200 || count($res['body']['data']['items']) !== 12) {
        throw new RuntimeException("Expected 12 assessment items, got " . json_encode($res['body']));
    }
});

// 9. Finalisasi Penilaian Seluruh DM
testHttp('Assessments: POST /api/assessments/me/finalize mengunci penilaian untuk DM1, DM2, DM3', function () use (&$dm1Token, &$dm2Token, &$dm3Token) {
    $res1 = apiRequest('POST', '/api/assessments/me/finalize', null, $dm1Token);
    $res2 = apiRequest('POST', '/api/assessments/me/finalize', null, $dm2Token);
    $res3 = apiRequest('POST', '/api/assessments/me/finalize', null, $dm3Token);

    if ($res1['status'] !== 200 || $res2['status'] !== 200 || $res3['status'] !== 200) {
        throw new RuntimeException("Finalisasi gagal untuk salah satu DM");
    }

    // Cek status panel
    $st = apiRequest('GET', '/api/assessments/status', null, $dm1Token);
    if ($st['status'] !== 200 || !($st['body']['data']['all_finalized'] ?? false)) {
        throw new RuntimeException("Expected all_finalized=true, got " . json_encode($st['body']));
    }
});

// 10. Perhitungan SAW Pribadi DM1
testHttp('Results: GET /api/results/saw/me mengembalikan skor SAW DM1 (A=91, B=85, C=79)', function () use (&$dm1Token) {
    $res = apiRequest('GET', '/api/results/saw/me', null, $dm1Token);
    if ($res['status'] !== 200) {
        throw new RuntimeException("Gagal menghitung SAW: " . json_encode($res['body']));
    }
    $rankings = $res['body']['data']['rankings'];
    $scores = array_column($rankings, 'final_score', 'candidate_id');
    if ((float)$scores[1] !== 91.0 || (float)$scores[2] !== 85.0 || (float)$scores[3] !== 79.0) {
        throw new RuntimeException("Skor SAW DM1 tidak sesuai Excel: " . json_encode($scores));
    }
});

// 11. Perhitungan Agregasi Borda
testHttp('Results: GET /api/results/borda mengembalikan poin Borda (A=8, B=6, C=4) dan persentase', function () use (&$dm1Token) {
    $res = apiRequest('GET', '/api/results/borda', null, $dm1Token);
    if ($res['status'] !== 200) {
        throw new RuntimeException("Gagal menghitung Borda: " . json_encode($res['body']));
    }
    $rankings = $res['body']['data']['rankings'];
    $points = array_column($rankings, 'borda_points', 'candidate_id');
    $percentages = array_column($rankings, 'percentage', 'candidate_id');

    if ((float)$points[1] !== 8.0 || (float)$points[2] !== 6.0 || (float)$points[3] !== 4.0) {
        throw new RuntimeException("Poin Borda tidak sesuai Excel: " . json_encode($points));
    }
    if (abs((float)$percentages[1] - 44.44) > 0.05 || abs((float)$percentages[2] - 33.33) > 0.05) {
        throw new RuntimeException("Persentase Borda tidak sesuai Excel: " . json_encode($percentages));
    }
});

// 12. Buka Voting oleh Ketua Panel
testHttp('Voting: POST /api/voting/open membuka sesi voting putaran 1', function () use (&$dm1Token, &$dm2Token) {
    // Anggota coba buka -> harus 403
    $resMember = apiRequest('POST', '/api/voting/open', null, $dm2Token);
    if ($resMember['status'] !== 403) {
        throw new RuntimeException("Expected 403 for member opening voting, got {$resMember['status']}");
    }

    // Ketua buka -> harus 201
    $resChair = apiRequest('POST', '/api/voting/open', null, $dm1Token);
    if ($resChair['status'] !== 201 || ($resChair['body']['data']['round_number'] ?? 0) !== 1) {
        throw new RuntimeException("Gagal membuka voting putaran 1: " . json_encode($resChair['body']));
    }
});

// 13. Pemberian Suara Voting
testHttp('Voting: POST /api/voting/vote mencatat suara masing-masing DM dan menghasilkan mayoritas', function () use (&$dm1Token, &$dm2Token, &$dm3Token) {
    // DM1 vote Kandidat A (1)
    $v1 = apiRequest('POST', '/api/voting/vote', ['candidate_id' => 1], $dm1Token);
    if ($v1['status'] !== 201) {
        throw new RuntimeException("DM1 gagal voting: " . json_encode($v1['body']));
    }

    // DM1 coba vote lagi di putaran sama -> harus 409
    $v1Duplicate = apiRequest('POST', '/api/voting/vote', ['candidate_id' => 2], $dm1Token);
    if ($v1Duplicate['status'] !== 409) {
        throw new RuntimeException("Duplicate vote tidak ditolak dengan 409: {$v1Duplicate['status']}");
    }

    // DM2 vote Kandidat B (2)
    $v2 = apiRequest('POST', '/api/voting/vote', ['candidate_id' => 2], $dm2Token);
    if ($v2['status'] !== 201) {
        throw new RuntimeException("DM2 gagal voting: " . json_encode($v2['body']));
    }

    // DM3 vote Kandidat A (1) -> menghasilkan mayoritas 2 dari 3 untuk Kandidat A
    $v3 = apiRequest('POST', '/api/voting/vote', ['candidate_id' => 1], $dm3Token);
    if ($v3['status'] !== 201 || $v3['body']['data']['evaluation']['status'] !== 'majority') {
        throw new RuntimeException("Hasil voting tidak menghasilkan majority: " . json_encode($v3['body']));
    }
});

// 14. GET /api/voting/results
testHttp('Voting: GET /api/voting/results mengembalikan hasil perolehan suara (A=2 suara / 66.67%)', function () use (&$dm1Token) {
    $res = apiRequest('GET', '/api/voting/results', null, $dm1Token);
    if ($res['status'] !== 200 || $res['body']['data']['results']['winner']['candidate_id'] !== 1) {
        throw new RuntimeException("Hasil voting tidak sesuai: " . json_encode($res['body']));
    }
});

// 15. Pengesahan Keputusan oleh Ketua Panel
testHttp('Decisions: POST /api/decisions/approve mengesahkan Kandidat A sebagai keputusan final', function () use (&$dm1Token, &$dm2Token) {
    // Anggota mencoba mengesahkan -> 403
    $resMember = apiRequest('POST', '/api/decisions/approve', ['reason' => 'Pengesahan palsu'], $dm2Token);
    if ($resMember['status'] !== 403) {
        throw new RuntimeException("Anggota tidak boleh mengesahkan: {$resMember['status']}");
    }

    // Ketua mengesahkan
    $resChair = apiRequest('POST', '/api/decisions/approve', [
        'reason' => 'Konsensus panel mufakat menetapkan Kandidat A berdasarkan visi Indonesia Maju dan mayoritas voting 66.67%.'
    ], $dm1Token);
    if ($resChair['status'] !== 201 || $resChair['body']['data']['candidate_id'] !== 1) {
        throw new RuntimeException("Pengesahan gagal: " . json_encode($resChair['body']));
    }

    // Pengesahan kedua kali pada sesi yang sama -> 409
    $resDuplicate = apiRequest('POST', '/api/decisions/approve', ['reason' => 'Pengesahan ulang'], $dm1Token);
    if ($resDuplicate['status'] !== 409) {
        throw new RuntimeException("Pengesahan kedua kali tidak ditolak dengan 409");
    }
});

// 16. Akses Hasil Final dan Riwayat oleh Seluruh DM
testHttp('Decisions: GET /api/decisions/final dan /api/decisions/history dapat diakses seluruh DM', function () use (&$dm2Token) {
    $resFinal = apiRequest('GET', '/api/decisions/final', null, $dm2Token);
    if ($resFinal['status'] !== 200 || $resFinal['body']['data']['candidate_name'] !== 'Kandidat A') {
        throw new RuntimeException("Gagal mengambil keputusan final: " . json_encode($resFinal['body']));
    }

    $resHistory = apiRequest('GET', '/api/decisions/history', null, $dm2Token);
    if ($resHistory['status'] !== 200 || count($resHistory['body']['data']['rounds']) < 1) {
        throw new RuntimeException("Gagal mengambil riwayat keputusan: " . json_encode($resHistory['body']));
    }
});

echo PHP_EOL . "=== RINGKASAN HTTP INTEGRATION TEST ===" . PHP_EOL;
echo "HTTP Tests Lulus : {$httpPassed}" . PHP_EOL;
echo "HTTP Tests Gagal : {$httpFailed}" . PHP_EOL;

if ($httpFailed > 0) {
    exit(1);
}
