<?php
declare(strict_types=1);

require_once __DIR__ . '/DecisionService.php';
require_once __DIR__ . '/App.php';

// Muat berkas .env jika ada di direktori root backend
(function () {
    $envPath = __DIR__ . '/../.env';
    if (file_exists($envPath) && is_readable($envPath)) {
        $lines = file($envPath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        foreach ($lines as $line) {
            $line = trim($line);
            if ($line === '' || str_starts_with($line, '#')) {
                continue;
            }
            if (str_contains($line, '=')) {
                [$key, $val] = explode('=', $line, 2);
                $key = trim($key);
                $val = trim($val, " \t\n\r\0\x0B\"'");
                if (getenv($key) === false) {
                    putenv("{$key}={$val}");
                    $_ENV[$key] = $val;
                    $_SERVER[$key] = $val;
                }
            }
        }
    }
})();

/**
 * Inisialisasi koneksi Database PDO (MySQL/MariaDB untuk server/XAMPP atau SQLite untuk testing)
 */
function database(?string $customDsn = null): PDO
{
    $defaultDsn = 'mysql:host=127.0.0.1;port=3306;dbname=gdss_pemilihan_presiden;charset=utf8mb4';
    $dsn = $customDsn ?: getenv('DB_DSN') ?: $defaultDsn;
    
    $options = [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ];

    if (str_starts_with($dsn, 'sqlite:')) {
        $pdo = new PDO($dsn, null, null, $options);
        $pdo->exec('PRAGMA foreign_keys = ON;');
        return $pdo;
    }

    if (!str_starts_with($dsn, 'mysql:')) {
        throw new RuntimeException('Driver database tidak didukung dalam DSN.');
    }

    $user = getenv('DB_USER') !== false ? getenv('DB_USER') : 'root';
    $pass = getenv('DB_PASSWORD') !== false ? getenv('DB_PASSWORD') : '';

    return new PDO($dsn, $user, $pass, $options);
}
