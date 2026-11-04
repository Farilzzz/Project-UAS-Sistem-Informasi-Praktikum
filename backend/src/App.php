<?php
declare(strict_types=1);

namespace Gdss;

use PDO;
use RuntimeException;
use InvalidArgumentException;

/**
 * Exception khusus untuk kesalahan HTTP API yang aman dikembalikan ke klien
 */
final class ApiError extends RuntimeException
{
    public function __construct(public int $httpStatus, string $message)
    {
        parent::__construct($message);
    }
}

/**
 * Controller Layanan Utama Aplikasi GDSS Pemilihan Calon Presiden
 */
final class App
{
    private DecisionService $calc;

    public function __construct(private PDO $db)
    {
        $this->calc = new DecisionService();
    }

    private function one(string $sql, array $args = []): ?array
    {
        $stmt = $this->db->prepare($sql);
        $stmt->execute($args);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        return $row ?: null;
    }

    private function all(string $sql, array $args = []): array
    {
        $stmt = $this->db->prepare($sql);
        $stmt->execute($args);
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    private function exec(string $sql, array $args = []): void
    {
        $stmt = $this->db->prepare($sql);
        $stmt->execute($args);
    }

    private function bad(bool $condition, int $status, string $message): void
    {
        if ($condition) {
            throw new ApiError($status, $message);
        }
    }

    public function actor(?array $user): array
    {
        $this->bad($user === null, 401, 'Autentikasi diperlukan. Silakan sertakan token Bearer yang valid.');
        return $user;
    }

    public function chair(?array $user): array
    {
        $u = $this->actor($user);
        $this->bad($u['role'] !== 'chair', 403, 'Akses ditolak. Tindakan ini hanya boleh dilakukan oleh Ketua Panel.');
        return $u;
    }

    private function lockSession(int $sessionId = 1): array
    {
        $driver = $this->db->getAttribute(PDO::ATTR_DRIVER_NAME);
        $sql = ($driver === 'mysql') 
            ? 'SELECT * FROM decision_sessions WHERE id = ? FOR UPDATE' 
            : 'SELECT * FROM decision_sessions WHERE id = ?';
        return $this->one($sql, [$sessionId]) ?? throw new ApiError(404, 'Sesi keputusan tidak ditemukan.');
    }

    private function audit(?int $userId, string $action, string $details, ?int $sessionId = 1, ?string $ip = null): void
    {
        $this->exec(
            'INSERT INTO audit_logs (session_id, user_id, action, details, ip_address) VALUES (?, ?, ?, ?, ?)',
            [$sessionId, $userId, $action, $details, $ip]
        );
    }

    private function transaction(callable $fn): mixed
    {
        $this->db->beginTransaction();
        try {
            $result = $fn();
            $this->db->commit();
            return $result;
        } catch (\Throwable $e) {
            $this->db->rollBack();
            throw $e;
        }
    }

    /**
     * Autentikasi Pengguna & Penanganan Rate Limiting
     */
    public function login(string $username, string $password, string $ip): array
    {
        $username = trim($username);
        $this->bad($username === '' || $password === '', 422, 'Username dan password wajib diisi.');

        $bucket = hash('sha256', strtolower($username) . '|' . $ip);
        $attempt = $this->one('SELECT attempts, started_at FROM login_attempts WHERE bucket = ?', [$bucket]);
        
        $now = time();
        if ($attempt !== null) {
            $elapsed = $now - (int)$attempt['started_at'];
            if ($elapsed < 900 && (int)$attempt['attempts'] >= 5) {
                throw new ApiError(429, 'Terlalu banyak percobaan login gagal. Silakan coba kembali setelah 15 menit.');
            }
        }

        $user = $this->one('SELECT id, username, name, role, password_hash FROM users WHERE username = ?', [$username]);
        if (!$user || !password_verify($password, $user['password_hash'])) {
            $count = ($attempt && ($now - (int)$attempt['started_at'] < 900)) ? (int)$attempt['attempts'] + 1 : 1;
            $startTime = ($attempt && ($now - (int)$attempt['started_at'] < 900)) ? (int)$attempt['started_at'] : $now;
            
            if ($attempt !== null) {
                $this->exec('UPDATE login_attempts SET attempts = ?, started_at = ? WHERE bucket = ?', [$count, $startTime, $bucket]);
            } else {
                $this->exec('INSERT INTO login_attempts (bucket, attempts, started_at) VALUES (?, ?, ?)', [$bucket, $count, $startTime]);
            }
            throw new ApiError(401, 'Username atau password tidak valid.');
        }

        if ($attempt !== null) {
            $this->exec('DELETE FROM login_attempts WHERE bucket = ?', [$bucket]);
        }

        $this->audit((int)$user['id'], 'auth_login', 'Login berhasil', 1, $ip);

        return [
            'id' => (int)$user['id'],
            'username' => $user['username'],
            'name' => $user['name'],
            'role' => $user['role'],
        ];
    }

    /**
     * Registrasi Pengguna Baru (Pemilih Publik)
     */
    public function register(string $name, string $username, string $password, string $ip): array
    {
        $name = trim($name);
        $username = trim($username);
        
        $this->bad($name === '', 422, 'Nama lengkap wajib diisi.');
        $this->bad($username === '', 422, 'Username wajib diisi.');
        $this->bad($password === '', 422, 'Password wajib diisi.');
        
        // Validasi format username: 3-50 karakter, alphanumeric dan underscore saja
        $this->bad(
            strlen($username) < 3 || strlen($username) > 50 || !preg_match('/^[a-z0-9_]+$/i', $username),
            422,
            'Username harus 3-50 karakter, hanya berisi huruf, angka, dan underscore.'
        );
        
        // Validasi panjang password: minimal 6 karakter
        $this->bad(
            strlen($password) < 6,
            422,
            'Password minimal 6 karakter.'
        );
        
        // Cek username sudah terdaftar
        $existing = $this->one('SELECT id FROM users WHERE username = ?', [$username]);
        $this->bad($existing !== null, 409, 'Username sudah terdaftar. Gunakan username lain.');
        
        // Hash password menggunakan bcrypt (kompatibel dengan login yang ada)
        $passwordHash = password_hash($password, PASSWORD_BCRYPT);
        
        return $this->transaction(function () use ($name, $username, $passwordHash, $ip) {
            $this->exec(
                'INSERT INTO users (name, username, role, password_hash) VALUES (?, ?, "voter", ?)',
                [$name, $username, $passwordHash]
            );
            
            $userId = (int)$this->db->lastInsertId();
            $this->audit($userId, 'auth_register', 'Akun baru terdaftar sebagai pemilih', null, $ip);
            
            return [
                'id' => $userId,
                'username' => $username,
                'name' => $name,
                'role' => 'voter',
                'message' => 'Pendaftaran berhasil. Silakan login dengan akun Anda.',
            ];
        });
    }

    /**
     * Master Data: Daftar Kandidat Presiden
     */
    public function listCandidates(): array
    {
        return $this->all('SELECT id, name, vision, mission, profile FROM candidates ORDER BY id');
    }

    /**
     * Master Data: Detail Satu Kandidat
     */
    public function getCandidate(int $id): array
    {
        $candidate = $this->one('SELECT id, name, vision, mission, profile FROM candidates WHERE id = ?', [$id]);
        $this->bad($candidate === null, 404, 'Kandidat tidak ditemukan.');
        return $candidate;
    }

    /**
     * Master Data: Daftar Kriteria Penilaian
     */
    public function listCriteria(): array
    {
        return $this->all('SELECT id, code, name, weight, type FROM criteria ORDER BY id');
    }

    /**
     * Penilaian: Ambil Penilaian Pribadi DM Saat Ini
     */
    public function getAssessmentsMe(?array $user, int $sessionId = 1): array
    {
        $u = $this->actor($user);
        $this->bad(
            !in_array($u['role'], ['chair', 'member'], true),
            403,
            'Akses ditolak. Hanya Ketua Panel dan Anggota Panel yang dapat mengakses penilaian.'
        );
        $statusRow = $this->one(
            'SELECT is_finalized, finalized_at FROM assessment_status WHERE session_id = ? AND user_id = ?',
            [$sessionId, $u['id']]
        );

        $items = $this->all(
            'SELECT candidate_id, criterion_id, score FROM assessments WHERE session_id = ? AND user_id = ? ORDER BY candidate_id, criterion_id',
            [$sessionId, $u['id']]
        );

        return [
            'user_id' => (int)$u['id'],
            'is_finalized' => (bool)($statusRow['is_finalized'] ?? 0),
            'finalized_at' => $statusRow['finalized_at'] ?? null,
            'items' => array_map(fn($it) => [
                'candidate_id' => (int)$it['candidate_id'],
                'criterion_id' => (int)$it['criterion_id'],
                'score' => (int)$it['score'],
            ], $items),
        ];
    }

    /**
     * Penilaian: Simpan / Perbarui Matriks Penilaian DM (Draft)
     */
    public function saveAssessmentsMe(?array $user, array $items, int $sessionId = 1): array
    {
        $u = $this->actor($user);
        $this->bad(
            !in_array($u['role'], ['chair', 'member'], true),
            403,
            'Akses ditolak. Hanya Ketua Panel dan Anggota Panel yang dapat menyimpan penilaian.'
        );
        $candidates = $this->listCandidates();
        $criteria = $this->listCriteria();

        // Validasi kelengkapan seluruh pasangan kandidat x kriteria (3 x 4 = 12 item)
        $expectedMap = [];
        foreach ($candidates as $cand) {
            foreach ($criteria as $crit) {
                $expectedMap[$cand['id'] . ':' . $crit['id']] = true;
            }
        }

        $validatedScores = [];
        foreach ($items as $item) {
            $this->bad(
                !is_array($item) || !isset($item['candidate_id'], $item['criterion_id'], $item['score']),
                422,
                'Format data penilaian tidak lengkap. Wajib menyertakan candidate_id, criterion_id, dan score.'
            );
            $key = $item['candidate_id'] . ':' . $item['criterion_id'];
            $this->bad(!isset($expectedMap[$key]), 422, 'Pasangan kandidat atau kriteria tidak valid: ' . $key);
            $this->bad(isset($validatedScores[$key]), 422, 'Duplikasi entri penilaian untuk pasangan: ' . $key);

            $validatedScores[$key] = $this->calc->validateScore($item['score']);
        }

        $this->bad(
            count($validatedScores) !== count($expectedMap),
            422,
            'Matriks penilaian harus lengkap untuk seluruh ' . count($candidates) . ' kandidat dan ' . count($criteria) . ' kriteria (' . count($expectedMap) . ' item).'
        );

        return $this->transaction(function () use ($u, $sessionId, $validatedScores) {
            $session = $this->lockSession($sessionId);
            $this->bad(
                $session['status'] !== 'assessment',
                409,
                'Penilaian tidak dapat diubah karena sesi telah berpindah ke tahap voting konsensus.'
            );

            $statusRow = $this->one(
                'SELECT is_finalized FROM assessment_status WHERE session_id = ? AND user_id = ?',
                [$sessionId, $u['id']]
            );
            $this->bad(
                !empty($statusRow['is_finalized']),
                409,
                'Penilaian Anda sudah difinalisasi dan telah dikunci. Tidak dapat diubah kembali.'
            );

            // Simpan setiap item skor
            foreach ($validatedScores as $key => $score) {
                [$candId, $critId] = array_map('intval', explode(':', $key));
                $exists = $this->one(
                    'SELECT id FROM assessments WHERE session_id = ? AND user_id = ? AND candidate_id = ? AND criterion_id = ?',
                    [$sessionId, $u['id'], $candId, $critId]
                );

                if ($exists !== null) {
                    $this->exec(
                        'UPDATE assessments SET score = ? WHERE id = ?',
                        [$score, $exists['id']]
                    );
                } else {
                    $this->exec(
                        'INSERT INTO assessments (session_id, user_id, candidate_id, criterion_id, score) VALUES (?, ?, ?, ?, ?)',
                        [$sessionId, $u['id'], $candId, $critId, $score]
                    );
                }
            }

            // Pastikan baris status ada
            if ($statusRow === null) {
                $this->exec(
                    'INSERT INTO assessment_status (session_id, user_id, is_finalized, finalized_at) VALUES (?, ?, 0, NULL)',
                    [$sessionId, $u['id']]
                );
            }

            $this->audit((int)$u['id'], 'assessment_save', 'Menyimpan matriks penilaian lengkap', $sessionId);

            return ['saved_items' => count($validatedScores)];
        });
    }

    /**
     * Penilaian: Finalisasi Penilaian Pribadi (Kunci Nilai)
     */
    public function finalizeAssessmentsMe(?array $user, int $sessionId = 1): array
    {
        $u = $this->actor($user);
        $this->bad(
            !in_array($u['role'], ['chair', 'member'], true),
            403,
            'Akses ditolak. Hanya Ketua Panel dan Anggota Panel yang dapat memfinalisasi penilaian.'
        );
        return $this->transaction(function () use ($u, $sessionId) {
            $session = $this->lockSession($sessionId);
            $this->bad(
                $session['status'] !== 'assessment',
                409,
                'Tahap penilaian sudah ditutup.'
            );

            $expectedCount = count($this->listCandidates()) * count($this->listCriteria());
            $actualCount = (int)$this->one(
                'SELECT COUNT(*) n FROM assessments WHERE session_id = ? AND user_id = ?',
                [$sessionId, $u['id']]
            )['n'];

            $this->bad(
                $actualCount !== $expectedCount,
                422,
                'Penilaian belum lengkap. Anda baru mengisi ' . $actualCount . ' dari ' . $expectedCount . ' item penilaian.'
            );

            $statusRow = $this->one(
                'SELECT is_finalized FROM assessment_status WHERE session_id = ? AND user_id = ?',
                [$sessionId, $u['id']]
            );

            $this->bad(
                !empty($statusRow['is_finalized']),
                409,
                'Penilaian Anda sudah pernah difinalisasi sebelumnya.'
            );

            $now = date('Y-m-d H:i:s');
            if ($statusRow !== null) {
                $this->exec(
                    'UPDATE assessment_status SET is_finalized = 1, finalized_at = ? WHERE session_id = ? AND user_id = ?',
                    [$now, $sessionId, $u['id']]
                );
            } else {
                $this->exec(
                    'INSERT INTO assessment_status (session_id, user_id, is_finalized, finalized_at) VALUES (?, ?, 1, ?)',
                    [$sessionId, $u['id'], $now]
                );
            }

            $this->audit((int)$u['id'], 'assessment_finalize', 'Penilaian difinalisasi dan dikunci', $sessionId);

            return [
                'is_finalized' => true,
                'finalized_at' => $now,
            ];
        });
    }

    /**
     * Penilaian: Status Finalisasi Seluruh Anggota Panel
     */
    public function getAssessmentsStatus(int $sessionId = 1): array
    {
        // Panel penilai hanya terdiri dari Ketua dan Anggota; pemilih publik (voter)
        // tidak mengisi penilaian dan tidak boleh memblokir pembukaan voting.
        $users = $this->all(
            'SELECT id, username, name, role FROM users WHERE role IN ("chair", "member") ORDER BY id',
            []
        );
        $statuses = $this->all(
            'SELECT user_id, is_finalized, finalized_at FROM assessment_status WHERE session_id = ?',
            [$sessionId]
        );
        $statusMap = array_column($statuses, null, 'user_id');

        $panel = [];
        $allFinalized = true;
        foreach ($users as $usr) {
            $uId = (int)$usr['id'];
            $st = $statusMap[$uId] ?? null;
            $isFin = !empty($st['is_finalized']);
            if (!$isFin) {
                $allFinalized = false;
            }
            $panel[] = [
                'user_id' => $uId,
                'username' => $usr['username'],
                'name' => $usr['name'],
                'role' => $usr['role'],
                'is_finalized' => $isFin,
                'finalized_at' => $st['finalized_at'] ?? null,
            ];
        }

        return [
            'all_finalized' => $allFinalized,
            'total_panelists' => count($users),
            'panel' => $panel,
        ];
    }

    /**
     * Perhitungan: Hasil SAW Pribadi DM yang Sedang Login
     */
    public function calculateSawMe(?array $user, int $sessionId = 1): array
    {
        $u = $this->actor($user);
        $this->bad(
            !in_array($u['role'], ['chair', 'member'], true),
            403,
            'Akses ditolak. Hanya Ketua Panel dan Anggota Panel yang memiliki perhitungan SAW pribadi.'
        );
        $statusRow = $this->one(
            'SELECT is_finalized FROM assessment_status WHERE session_id = ? AND user_id = ?',
            [$sessionId, $u['id']]
        );

        $this->bad(
            empty($statusRow['is_finalized']),
            409,
            'Anda harus menyelesaikan dan memfinalisasi penilaian terlebih dahulu sebelum melihat hasil SAW.'
        );

        $candidates = $this->listCandidates();
        $criteria = $this->listCriteria();
        $candidateMap = array_column($candidates, 'name', 'id');

        $matrix = [];
        foreach ($candidates as $c) {
            $matrix[$c['id']] = ['candidate_id' => (int)$c['id'], 'scores' => []];
        }

        $scores = $this->all(
            'SELECT candidate_id, criterion_id, score FROM assessments WHERE session_id = ? AND user_id = ?',
            [$sessionId, $u['id']]
        );
        foreach ($scores as $s) {
            $matrix[$s['candidate_id']]['scores'][(int)$s['criterion_id']] = (int)$s['score'];
        }

        $sawResults = $this->calc->calculateSaw($criteria, array_values($matrix));

        // Tambahkan nama kandidat ke hasil
        foreach ($sawResults as &$item) {
            $item['candidate_name'] = $candidateMap[$item['candidate_id']] ?? ('Kandidat ' . $item['candidate_id']);
        }

        return [
            'dm_user_id' => (int)$u['id'],
            'dm_name' => $u['name'],
            'rankings' => $sawResults,
        ];
    }

    /**
     * Perhitungan: Agregasi Borda dari Ketiga Decision Maker
     */
    public function calculateBorda(int $sessionId = 1): array
    {
        $panelStatus = $this->getAssessmentsStatus($sessionId);
        $this->bad(
            !$panelStatus['all_finalized'],
            409,
            'Hasil Borda belum dapat dihitung karena belum seluruh Decision Maker memfinalisasi penilaian.'
        );

        $candidates = $this->listCandidates();
        $criteria = $this->listCriteria();
        // Hanya Ketua dan Anggota Panel yang menilai; pemilih publik tidak memiliki
        // penilaian dan tidak boleh masuk ke agregasi Borda.
        $users = $this->all(
            'SELECT id, name FROM users WHERE role IN ("chair", "member") ORDER BY id',
            []
        );

        $dmScores = [];
        foreach ($users as $usr) {
            $uId = (int)$usr['id'];
            $matrix = [];
            foreach ($candidates as $c) {
                $matrix[$c['id']] = ['candidate_id' => (int)$c['id'], 'scores' => []];
            }
            $scores = $this->all(
                'SELECT candidate_id, criterion_id, score FROM assessments WHERE session_id = ? AND user_id = ?',
                [$sessionId, $uId]
            );
            foreach ($scores as $s) {
                $matrix[$s['candidate_id']]['scores'][(int)$s['criterion_id']] = (int)$s['score'];
            }
            $sawOut = $this->calc->calculateSaw($criteria, array_values($matrix));
            $dmScores[$uId] = array_column($sawOut, 'final_score', 'candidate_id');
        }

        return $this->calc->calculateBorda($dmScores, $candidates);
    }

    /**
     * Voting: Status Sesi Voting Saat Ini
     */
    public function getVotingStatus(?array $user, int $sessionId = 1): array
    {
        $u = $this->actor($user);
        $session = $this->one('SELECT * FROM decision_sessions WHERE id = ?', [$sessionId]);
        $this->bad($session === null, 404, 'Sesi keputusan tidak ditemukan.');

        $currentRoundNo = (int)$session['current_round'];
        $currentRound = null;
        $hasVoted = false;
        $votesCount = 0;
        $evalResult = null;

        if ($currentRoundNo > 0) {
            $currentRound = $this->one(
                'SELECT * FROM voting_rounds WHERE session_id = ? AND round_number = ?',
                [$sessionId, $currentRoundNo]
            );

            if ($currentRound !== null) {
                $userVote = $this->one(
                    'SELECT id FROM votes WHERE round_id = ? AND user_id = ?',
                    [$currentRound['id'], $u['id']]
                );
                $hasVoted = ($userVote !== null);

                $roundVotes = $this->all(
                    'SELECT user_id, candidate_id FROM votes WHERE round_id = ?',
                    [$currentRound['id']]
                );
                $votesCount = count($roundVotes);

                $voteMap = array_column($roundVotes, 'candidate_id', 'user_id');
                
                // Get eligible voter count from snapshot
                $eligibleCountRow = $this->one(
                    'SELECT COUNT(*) as cnt FROM session_voters WHERE session_id = ?',
                    [$sessionId]
                );
                $eligibleCount = (int)$eligibleCountRow['cnt'];
                
                $evalResult = $this->calc->evaluateVotes($voteMap, $this->listCandidates(), $eligibleCount);
            }
        }

        $decision = $this->one(
            'SELECT fd.*, c.name as candidate_name, u.name as approved_by_name FROM final_decisions fd JOIN candidates c ON fd.candidate_id = c.id JOIN users u ON fd.approved_by = u.id WHERE fd.session_id = ?',
            [$sessionId]
        );

        // Snapshot electorate metadata (frozen at first round)
        $eligibleCountRow = $this->one(
            'SELECT COUNT(*) as cnt FROM session_voters WHERE session_id = ?',
            [$sessionId]
        );
        $eligibleCount = (int)$eligibleCountRow['cnt'];

        $isEligible = false;
        if ($eligibleCount > 0) {
            $snapshotRow = $this->one(
                'SELECT user_id FROM session_voters WHERE session_id = ? AND user_id = ?',
                [$sessionId, $u['id']]
            );
            $isEligible = ($snapshotRow !== null);
        }

        return [
            'session_status' => $session['status'],
            'current_round' => $currentRoundNo,
            'is_voting_open' => ($session['status'] === 'voting' && $currentRound !== null && $currentRound['status'] === 'open'),
            'has_voted_this_round' => $hasVoted,
            'votes_cast_in_round' => $votesCount,
            'eligible_voters' => $eligibleCount,
            'required_votes' => $eligibleCount,
            'majority_threshold' => $eligibleCount > 0 ? (int)ceil((2 * $eligibleCount) / 3) : 0,
            'is_eligible' => $isEligible,
            'evaluation' => $evalResult,
            'ratified_decision' => $decision,
            'can_chair_open' => ($u['role'] === 'chair' && in_array($session['status'], ['assessment', 'tie_revote'], true)),
            'can_chair_approve' => ($u['role'] === 'chair' && $session['status'] === 'voting_completed' && $evalResult && $evalResult['status'] === 'majority'),
        ];
    }

    /**
     * Voting: Buka Sesi Voting Putaran Pertama (Hanya Ketua Panel)
     */
    public function openVoting(?array $user, int $sessionId = 1): array
    {
        $u = $this->chair($user);
        return $this->transaction(function () use ($u, $sessionId) {
            $session = $this->lockSession($sessionId);
            $this->bad(
                $session['status'] !== 'assessment',
                409,
                'Sesi voting hanya dapat dibuka saat sesi berstatus assessment.'
            );

            $status = $this->getAssessmentsStatus($sessionId);
            $this->bad(
                !$status['all_finalized'],
                409,
                'Seluruh Decision Maker harus memfinalisasi penilaian terlebih dahulu sebelum voting dapat dibuka.'
            );

            // Snapshot eligible voters on first round only
            $existingSnapshot = $this->one(
                'SELECT COUNT(*) as cnt FROM session_voters WHERE session_id = ?',
                [$sessionId]
            );
            if ($existingSnapshot['cnt'] == 0) {
                $eligibleUsers = $this->all(
                    'SELECT id FROM users WHERE role IN ("chair", "member", "voter") ORDER BY id',
                    []
                );
                foreach ($eligibleUsers as $voter) {
                    $this->exec(
                        'INSERT INTO session_voters (session_id, user_id) VALUES (?, ?)',
                        [$sessionId, $voter['id']]
                    );
                }
            }

            $roundNo = 1;
            $this->exec(
                'INSERT INTO voting_rounds (session_id, round_number, status, opened_by) VALUES (?, ?, "open", ?)',
                [$sessionId, $roundNo, $u['id']]
            );

            $this->exec(
                'UPDATE decision_sessions SET status = "voting", current_round = ? WHERE id = ?',
                [$roundNo, $sessionId]
            );

            $this->audit((int)$u['id'], 'voting_open', 'Membuka voting putaran ' . $roundNo, $sessionId);

            return [
                'round_number' => $roundNo,
                'status' => 'open',
                'message' => 'Sesi voting putaran 1 berhasil dibuka.',
            ];
        });
    }

    /**
     * Voting: Berikan 1 Suara pada Putaran Aktif
     */
    public function vote(?array $user, mixed $candidateId, int $sessionId = 1): array
    {
        $u = $this->actor($user);
        $this->bad(
            !is_int($candidateId) && !(is_string($candidateId) && ctype_digit((string)$candidateId)),
            422,
            'Pilihan kandidat (candidate_id) wajib diisi berupa bilangan bulat.'
        );
        $cId = (int)$candidateId;
        $this->getCandidate($cId); // Pastikan kandidat valid

        return $this->transaction(function () use ($u, $cId, $sessionId) {
            $session = $this->lockSession($sessionId);
            $this->bad(
                $session['status'] !== 'voting',
                409,
                'Voting tidak sedang dibuka atau telah ditutup.'
            );

            // Check user eligibility from session snapshot
            $eligible = $this->one(
                'SELECT user_id FROM session_voters WHERE session_id = ? AND user_id = ?',
                [$sessionId, $u['id']]
            );
            $this->bad(
                $eligible === null,
                403,
                'Anda tidak terdaftar dalam daftar pemilih yang berhak untuk sesi ini.'
            );

            $roundNo = (int)$session['current_round'];
            $round = $this->one(
                'SELECT * FROM voting_rounds WHERE session_id = ? AND round_number = ?',
                [$sessionId, $roundNo]
            );
            $this->bad(
                $round === null || $round['status'] !== 'open',
                409,
                'Putaran voting ' . $roundNo . ' tidak sedang aktif menerima suara.'
            );

            $existingVote = $this->one(
                'SELECT id FROM votes WHERE round_id = ? AND user_id = ?',
                [$round['id'], $u['id']]
            );
            $this->bad(
                $existingVote !== null,
                409,
                'Anda sudah memberikan suara pada putaran ' . $roundNo . '. Suara yang sudah masuk tidak dapat diubah.'
            );

            $this->exec(
                'INSERT INTO votes (session_id, round_id, user_id, candidate_id) VALUES (?, ?, ?, ?)',
                [$sessionId, $round['id'], $u['id'], $cId]
            );

            $roundVotes = $this->all(
                'SELECT user_id, candidate_id FROM votes WHERE round_id = ?',
                [$round['id']]
            );
            $voteCount = count($roundVotes);

            // Get eligible voter count from snapshot
            $eligibleCountRow = $this->one(
                'SELECT COUNT(*) as cnt FROM session_voters WHERE session_id = ?',
                [$sessionId]
            );
            $eligibleCount = (int)$eligibleCountRow['cnt'];

            $eval = $this->calc->evaluateVotes(
                array_column($roundVotes, 'candidate_id', 'user_id'),
                $this->listCandidates(),
                $eligibleCount
            );

            // If voting complete, update status
            if ($eval['is_completed']) {
                $now = date('Y-m-d H:i:s');
                if ($eval['status'] === 'majority') {
                    $this->exec('UPDATE voting_rounds SET status = "completed", closed_at = ? WHERE id = ?', [$now, $round['id']]);
                    $this->exec('UPDATE decision_sessions SET status = "voting_completed" WHERE id = ?', [$sessionId]);
                } else {
                    $this->exec('UPDATE voting_rounds SET status = "tie_revote", closed_at = ? WHERE id = ?', [$now, $round['id']]);
                    $this->exec('UPDATE decision_sessions SET status = "tie_revote" WHERE id = ?', [$sessionId]);
                }
            }

            $this->audit((int)$u['id'], 'voting_cast', 'Memberikan suara pada putaran ' . $roundNo, $sessionId);

            return [
                'round_number' => $roundNo,
                'has_voted' => true,
                'votes_cast_in_round' => $voteCount,
                'round_completed' => $eval['is_completed'],
                'evaluation' => $eval,
            ];
        });
    }

    /**
     * Voting: Ambil Hasil Perolehan Suara Putaran Terkini
     */
    public function getVotingResults(int $sessionId = 1): array
    {
        $session = $this->one('SELECT * FROM decision_sessions WHERE id = ?', [$sessionId]);
        $this->bad($session === null, 404, 'Sesi tidak ditemukan.');

        $currentRoundNo = (int)$session['current_round'];
        $this->bad($currentRoundNo < 1, 409, 'Belum ada putaran voting yang dimulai.');

        $round = $this->one(
            'SELECT * FROM voting_rounds WHERE session_id = ? AND round_number = ?',
            [$sessionId, $currentRoundNo]
        );
        $this->bad($round === null, 404, 'Putaran voting tidak ditemukan.');

        $votes = $this->all(
            'SELECT user_id, candidate_id FROM votes WHERE round_id = ?',
            [$round['id']]
        );

        $eval = $this->calc->evaluateVotes(
            array_column($votes, 'candidate_id', 'user_id'),
            $this->listCandidates(),
            (int)$this->one('SELECT COUNT(*) as cnt FROM session_voters WHERE session_id = ?', [$sessionId])['cnt']
        );

        return [
            'session_status' => $session['status'],
            'round_number' => $currentRoundNo,
            'round_status' => $round['status'],
            'results' => $eval,
        ];
    }

    /**
     * Voting: Buka Putaran Ulang Jika Terjadi Seri 1-1-1 (Hanya Ketua Panel)
     */
    public function nextRoundVoting(?array $user, int $sessionId = 1): array
    {
        $u = $this->chair($user);
        return $this->transaction(function () use ($u, $sessionId) {
            $session = $this->lockSession($sessionId);
            $this->bad(
                $session['status'] !== 'tie_revote',
                409,
                'Putaran baru hanya dapat dibuka apabila putaran sebelumnya menghasilkan seri (tie_revote).'
            );

            $currentRoundNo = (int)$session['current_round'];
            $prevRound = $this->one(
                'SELECT * FROM voting_rounds WHERE session_id = ? AND round_number = ?',
                [$sessionId, $currentRoundNo]
            );
            $this->bad(
                $prevRound === null || $prevRound['status'] !== 'tie_revote',
                409,
                'Putaran sebelumnya belum selesai atau tidak dalam kondisi seri.'
            );

            $nextRoundNo = $currentRoundNo + 1;
            $this->exec(
                'INSERT INTO voting_rounds (session_id, round_number, status, opened_by) VALUES (?, ?, "open", ?)',
                [$sessionId, $nextRoundNo, $u['id']]
            );

            $this->exec(
                'UPDATE decision_sessions SET status = "voting", current_round = ? WHERE id = ?',
                [$nextRoundNo, $sessionId]
            );

            $this->audit((int)$u['id'], 'voting_next_round', 'Membuka putaran voting ulang ' . $nextRoundNo, $sessionId);

            return [
                'round_number' => $nextRoundNo,
                'status' => 'open',
                'message' => 'Putaran voting ulang ' . $nextRoundNo . ' berhasil dibuka.',
            ];
        });
    }

    /**
     * Pengesahan: Sahkan Hasil Keputusan Mayoritas (Hanya Ketua Panel)
     */
    public function approveDecision(?array $user, string $reason, int $sessionId = 1): array
    {
        $u = $this->chair($user);
        $reason = trim($reason);
        $this->bad($reason === '', 422, 'Alasan pengesahan konsensus wajib diisi.');
        $this->bad(mb_strlen($reason) > 1000, 422, 'Alasan pengesahan maksimal 1000 karakter.');

        return $this->transaction(function () use ($u, $reason, $sessionId) {
            $session = $this->lockSession($sessionId);
            $this->bad(
                $session['status'] !== 'voting_completed',
                409,
                'Pengesahan hanya dapat dilakukan setelah putaran voting menghasilkan mayoritas sah.'
            );

            $existing = $this->one('SELECT id FROM final_decisions WHERE session_id = ?', [$sessionId]);
            $this->bad($existing !== null, 409, 'Keputusan untuk sesi ini sudah pernah disahkan sebelumnya.');

            $currentRoundNo = (int)$session['current_round'];
            $round = $this->one(
                'SELECT * FROM voting_rounds WHERE session_id = ? AND round_number = ?',
                [$sessionId, $currentRoundNo]
            );
            $this->bad($round === null, 404, 'Data putaran voting tidak ditemukan.');

            $votes = $this->all('SELECT user_id, candidate_id FROM votes WHERE round_id = ?', [$round['id']]);
            $eval = $this->calc->evaluateVotes(
                array_column($votes, 'candidate_id', 'user_id'),
                $this->listCandidates(),
                (int)$this->one('SELECT COUNT(*) as cnt FROM session_voters WHERE session_id = ?', [$sessionId])['cnt']
            );

            $this->bad($eval['status'] !== 'majority', 409, 'Tidak ada calon mayoritas yang sah untuk disahkan.');

            $winner = $eval['winner'];
            $now = date('Y-m-d H:i:s');

            $this->exec(
                'INSERT INTO final_decisions (session_id, round_id, candidate_id, approved_by, reason, total_votes, percentage, approved_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                [$sessionId, $round['id'], $winner['candidate_id'], $u['id'], $reason, $winner['votes'], $winner['percentage'], $now]
            );

            $this->exec('UPDATE decision_sessions SET status = "ratified" WHERE id = ?', [$sessionId]);

            $this->audit((int)$u['id'], 'decision_approve', 'Mengesahkan keputusan terpilih: ' . $winner['candidate_name'], $sessionId);

            return [
                'session_id' => $sessionId,
                'round_number' => $currentRoundNo,
                'candidate_id' => $winner['candidate_id'],
                'candidate_name' => $winner['candidate_name'],
                'total_votes' => $winner['votes'],
                'percentage' => $winner['percentage'],
                'approved_by' => $u['name'],
                'reason' => $reason,
                'approved_at' => $now,
            ];
        });
    }

    /**
     * Pengesahan: Ambil Keputusan Final yang Sudah Disahkan
     */
    public function getFinalDecision(int $sessionId = 1): ?array
    {
        $row = $this->one(
            'SELECT fd.id, fd.session_id, fd.round_id, fd.candidate_id, c.name as candidate_name, c.vision, c.mission, fd.total_votes, fd.percentage, u.name as approved_by_name, fd.reason, fd.approved_at, vr.round_number FROM final_decisions fd JOIN candidates c ON fd.candidate_id = c.id JOIN users u ON fd.approved_by = u.id JOIN voting_rounds vr ON fd.round_id = vr.id WHERE fd.session_id = ?',
            [$sessionId]
        );
        return $row ?: null;
    }

    /**
     * Pengesahan: Riwayat Keputusan dan Putaran Voting
     */
    public function getDecisionsHistory(int $sessionId = 1): array
    {
        $rounds = $this->all(
            'SELECT vr.id, vr.round_number, vr.status, vr.opened_at, vr.closed_at, u.name as opened_by_name FROM voting_rounds vr JOIN users u ON vr.opened_by = u.id WHERE vr.session_id = ? ORDER BY vr.round_number',
            [$sessionId]
        );

        $final = $this->getFinalDecision($sessionId);

        $roundsWithVotes = [];
        $candidates = $this->listCandidates();
        $eligibleCountRow = $this->one(
            'SELECT COUNT(*) as cnt FROM session_voters WHERE session_id = ?',
            [$sessionId]
        );
        $eligibleCount = (int)$eligibleCountRow['cnt'];
        foreach ($rounds as $r) {
            $votes = $this->all('SELECT user_id, candidate_id FROM votes WHERE round_id = ?', [$r['id']]);
            $eval = $this->calc->evaluateVotes(
                array_column($votes, 'candidate_id', 'user_id'),
                $candidates,
                $eligibleCount
            );
            $r['evaluation'] = $eval;
            $roundsWithVotes[] = $r;
        }

        return [
            'session_id' => $sessionId,
            'rounds' => $roundsWithVotes,
            'final_decision' => $final,
        ];
    }
}
