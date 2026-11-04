<?php
declare(strict_types=1);

require_once __DIR__ . '/../src/bootstrap.php';

use Gdss\App;
use Gdss\ApiError;

// 1. Header Keamanan Standar
header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');

// 2. Penanganan CORS (Cross-Origin Resource Sharing)
(function () {
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    $allowedConfig = getenv('CORS_ALLOWED_ORIGINS') ?: '';
    $allowedOrigins = array_filter(array_map('trim', explode(',', $allowedConfig)));
    $defaults = ['http://localhost:3000', 'http://localhost:3001', 'http://127.0.0.1:3000', 'http://127.0.0.1:3001', 'http://127.0.0.1:5500', 'http://localhost:5500', 'http://127.0.0.1:8000', 'http://localhost:8080'];
    $allowedOrigins = array_unique(array_merge($allowedOrigins, $defaults));

    if ($origin !== '' && in_array($origin, $allowedOrigins, true)) {
        header("Access-Control-Allow-Origin: {$origin}");
        header('Access-Control-Allow-Credentials: true');
    } elseif ($origin !== '' && in_array('*', $allowedOrigins, true)) {
        header('Access-Control-Allow-Origin: *');
    }

    header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');
    header('Access-Control-Max-Age: 86400');

    if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
        http_response_code(204);
        exit;
    }
})();

// 3. Response JSON Helper Konsisten
function respond(int $statusCode, bool $success, string $message, mixed $data = null): never
{
    http_response_code($statusCode);
    echo json_encode([
        'success' => $success,
        'message' => $message,
        'data' => $data,
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

// 4. Token Helper (HMAC-SHA256 Stateless Bearer Token)
function appKey(): string
{
    $key = getenv('APP_KEY') ?: '';
    if (strlen($key) < 32) {
        throw new RuntimeException('APP_KEY belum dikonfigurasi atau kurang dari 32 karakter.');
    }
    return $key;
}

function base64UrlEncode(string $data): string
{
    return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
}

function base64UrlDecode(string $data): string
{
    return base64_decode(strtr($data, '-_', '+/') . str_repeat('=', (4 - strlen($data) % 4) % 4), true) ?: '';
}

function createToken(array $user): string
{
    $payload = [
        'sub' => (int)$user['id'],
        'username' => $user['username'],
        'role' => $user['role'],
        'iat' => time(),
        'exp' => time() + 3600, // Berlaku 1 jam
    ];
    $encodedPayload = base64UrlEncode(json_encode($payload));
    $signature = base64UrlEncode(hash_hmac('sha256', $encodedPayload, appKey(), true));
    return $encodedPayload . '.' . $signature;
}

function authenticateToken(PDO $db): ?array
{
    $authHeader = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    if (!preg_match('/^Bearer\s+([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/', $authHeader, $matches)) {
        return null;
    }

    [$encodedPayload, $signature] = explode('.', $matches[1], 2);
    $expectedSignature = base64UrlEncode(hash_hmac('sha256', $encodedPayload, appKey(), true));
    if (!hash_equals($expectedSignature, $signature)) {
        throw new ApiError(401, 'Token autentikasi tidak valid atau telah dimodifikasi.');
    }

    $payload = json_decode(base64UrlDecode($encodedPayload), true);
    if (!is_array($payload) || ($payload['exp'] ?? 0) < time()) {
        throw new ApiError(401, 'Sesi token telah kedaluwarsa. Silakan login kembali.');
    }

    $stmt = $db->prepare('SELECT id, username, name, role FROM users WHERE id = ?');
    $stmt->execute([(int)$payload['sub']]);
    $user = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$user) {
        throw new ApiError(401, 'Pengguna pemilik token tidak ditemukan.');
    }

    return [
        'id' => (int)$user['id'],
        'username' => $user['username'],
        'name' => $user['name'],
        'role' => $user['role'],
    ];
}

function parseJsonBody(): array
{
    $raw = file_get_contents('php://input');
    if ($raw === '' || $raw === false) {
        return [];
    }
    $decoded = json_decode($raw, true);
    if (!is_array($decoded)) {
        throw new ApiError(400, 'Payload harus berupa JSON object yang valid.');
    }
    return $decoded;
}

// 5. Router Eksekusi Utama
try {
    $db = database();
    $app = new App($db);

    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    $rawPath = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
    $path = '/' . trim($rawPath, '/');

    // Normalisasi prefix /api
    $apiPrefix = '/api';
    if (!str_starts_with($path, $apiPrefix)) {
        throw new ApiError(404, 'Endpoint tidak ditemukan. Seluruh API menggunakan prefix /api.');
    }

    $route = substr($path, strlen($apiPrefix)) ?: '/';
    $body = parseJsonBody();
    $currentUser = authenticateToken($db);
    $clientIp = $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1';

    // Route: Autentikasi
    if ($method === 'POST' && ($route === '/auth/login' || $route === '/login')) {
        $user = $app->login(
            (string)($body['username'] ?? ''),
            (string)($body['password'] ?? ''),
            $clientIp
        );
        $token = createToken($user);
        respond(200, true, 'Login berhasil.', [
            'token' => $token,
            'token_type' => 'Bearer',
            'expires_in' => 3600,
            'user' => $user,
        ]);
    }

    if ($method === 'POST' && ($route === '/auth/register' || $route === '/register')) {
        $result = $app->register(
            (string)($body['name'] ?? ''),
            (string)($body['username'] ?? ''),
            (string)($body['password'] ?? ''),
            $clientIp
        );
        respond(201, true, $result['message'], $result);
    }

    if ($method === 'GET' && ($route === '/auth/me' || $route === '/me')) {
        $user = $app->actor($currentUser);
        respond(200, true, 'Profil pengguna berhasil diambil.', $user);
    }

    if ($method === 'POST' && ($route === '/auth/logout' || $route === '/logout')) {
        $app->actor($currentUser);
        respond(200, true, 'Logout berhasil. Sesi token di sisi klien silakan dihapus.', null);
    }

    // Route: Master Data (wajib autentikasi; voter boleh melihat kandidat & kriteria)
    if ($method === 'GET' && $route === '/candidates') {
        $app->actor($currentUser);
        respond(200, true, 'Daftar kandidat berhasil diambil.', $app->listCandidates());
    }

    if ($method === 'GET' && preg_match('#^/candidates/(\d+)$#', $route, $m)) {
        $app->actor($currentUser);
        respond(200, true, 'Detail kandidat berhasil diambil.', $app->getCandidate((int)$m[1]));
    }

    if ($method === 'GET' && $route === '/criteria') {
        $app->actor($currentUser);
        respond(200, true, 'Daftar kriteria berhasil diambil.', $app->listCriteria());
    }

    // Route: Penilaian (Assessments)
    if ($method === 'GET' && ($route === '/assessments/me' || $route === '/assessments')) {
        respond(200, true, 'Penilaian pribadi berhasil diambil.', $app->getAssessmentsMe($currentUser));
    }

    if ($method === 'PUT' && ($route === '/assessments/me' || $route === '/assessments')) {
        $result = $app->saveAssessmentsMe($currentUser, $body['items'] ?? []);
        respond(200, true, 'Matriks penilaian berhasil disimpan.', $result);
    }

    if ($method === 'POST' && ($route === '/assessments/me/finalize' || $route === '/assessments/submit')) {
        $result = $app->finalizeAssessmentsMe($currentUser);
        respond(200, true, 'Penilaian berhasil difinalisasi dan dikunci.', $result);
    }

    if ($method === 'GET' && ($route === '/assessments/status' || $route === '/status')) {
        $u = $app->actor($currentUser);
        if (!in_array($u['role'], ['chair', 'member'], true)) {
            throw new ApiError(403, 'Akses ditolak. Hanya Ketua Panel dan Anggota Panel yang dapat melihat status penilaian.');
        }
        respond(200, true, 'Status penilaian seluruh panel berhasil diambil.', $app->getAssessmentsStatus());
    }

    // Route: Perhitungan (Results)
    if ($method === 'GET' && ($route === '/results/saw/me' || $route === '/results/saw')) {
        respond(200, true, 'Perhitungan SAW pribadi berhasil diambil.', $app->calculateSawMe($currentUser));
    }

    if ($method === 'GET' && $route === '/results/borda') {
        $u = $app->actor($currentUser);
        if (!in_array($u['role'], ['chair', 'member'], true)) {
            throw new ApiError(403, 'Akses ditolak. Hasil Borda hanya dapat diakses oleh Ketua Panel dan Anggota Panel.');
        }
        respond(200, true, 'Agregasi metode Borda berhasil dihitung.', $app->calculateBorda());
    }

    // Route: Voting Langsung
    if ($method === 'GET' && $route === '/voting/status') {
        respond(200, true, 'Status sesi voting berhasil diambil.', $app->getVotingStatus($currentUser));
    }

    if ($method === 'POST' && ($route === '/voting/open' || $route === '/rounds')) {
        $res = $app->openVoting($currentUser);
        respond(201, true, $res['message'] ?? 'Sesi voting berhasil dibuka.', $res);
    }

    if ($method === 'POST' && ($route === '/voting/vote' || $route === '/votes')) {
        $res = $app->vote($currentUser, $body['candidate_id'] ?? null);
        respond(201, true, 'Suara voting Anda berhasil dicatat.', $res);
    }

    if ($method === 'GET' && $route === '/voting/results') {
        $app->actor($currentUser);
        respond(200, true, 'Hasil perolehan suara voting berhasil diambil.', $app->getVotingResults());
    }

    if ($method === 'POST' && $route === '/voting/next-round') {
        $res = $app->nextRoundVoting($currentUser);
        respond(201, true, $res['message'] ?? 'Putaran voting baru berhasil dibuka.', $res);
    }

    // Route: Pengesahan Keputusan (Decisions)
    if ($method === 'POST' && ($route === '/decisions/approve' || $route === '/decision')) {
        $res = $app->approveDecision($currentUser, (string)($body['reason'] ?? ''));
        respond(201, true, 'Keputusan konsensus mayoritas berhasil disahkan oleh Ketua Panel.', $res);
    }

    if ($method === 'GET' && $route === '/decisions/final') {
        $app->actor($currentUser);
        $res = $app->getFinalDecision();
        if ($res === null) {
            throw new ApiError(404, 'Belum ada keputusan final yang disahkan.');
        }
        respond(200, true, 'Keputusan konsensus final berhasil diambil.', $res);
    }

    if ($method === 'GET' && $route === '/decisions/history') {
        $app->actor($currentUser);
        respond(200, true, 'Riwayat putaran voting dan keputusan berhasil diambil.', $app->getDecisionsHistory());
    }

    throw new ApiError(404, "Endpoint {$method} {$path} tidak ditemukan.");

} catch (ApiError $e) {
    respond($e->httpStatus, false, $e->getMessage(), null);
} catch (PDOException $e) {
    error_log('Database Error: ' . $e->getMessage());
    respond(503, false, 'Layanan database tidak tersedia atau mengalami kegagalan.', null);
} catch (Throwable $e) {
    error_log('Internal Error: ' . $e->getMessage());
    respond(500, false, 'Terjadi kesalahan internal pada server.', null);
}
