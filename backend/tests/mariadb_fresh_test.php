<?php
declare(strict_types=1);
// Real MariaDB App, concurrent processes, and HTTP tests. Explicit isolated 3307 only.
// CLI loads classes directly; HTTP child overrides DB configuration without editing .env.
require_once __DIR__ . '/../src/DecisionService.php';
require_once __DIR__ . '/../src/App.php';
use Gdss\App;
use Gdss\ApiError;
$passed = 0;
function check(bool $ok, string $label): void {
    global $passed;
    if (!$ok) throw new RuntimeException($label);
    ++$passed; echo "PASS $label\n";
}
function rejected(callable $fn, string $label, ?int $status = null): void {
    try { $fn(); } catch (ApiError $e) { check($status === null || $e->httpStatus === $status, $label); return; }
    throw new RuntimeException("Not rejected: $label");
}
function importSql(PDO $db, string $sql): void {
    // Files contain plain statements only; stop immediately on any SQL error.
    $sql = preg_replace('/^\s*--.*$/m', '', $sql);
    try {
        foreach (explode(';', $sql) as $statement) if (trim($statement) !== '') $db->exec($statement);
    } catch (Throwable $e) {
        if ($db->inTransaction()) $db->rollBack();
        throw $e;
    }
}
try {
    $schema = file_get_contents(__DIR__ . '/../database/schema.sql');
    $seed = file_get_contents(__DIR__ . '/../database/seed.sql');
    check(!preg_match('/^\s*(CREATE\s+DATABASE|USE\s+)/mi', $schema . "\n" . $seed), 'SQL respects explicitly selected database');
    $db = new PDO('mysql:host=127.0.0.1;port=3307;charset=utf8mb4', 'root', '', [PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC,PDO::ATTR_EMULATE_PREPARES=>false]);
    check(str_contains($db->query('SELECT VERSION()')->fetchColumn(), 'MariaDB'), 'real MariaDB reachable on isolated 3307');
    $name = 'gdss_pilpress_fresh_test_' . date('Ymd_His') . '_' . bin2hex(random_bytes(4));
    if (!preg_match('/^gdss_pilpress_fresh_test_[a-zA-Z0-9_]+$/D', $name)) throw new RuntimeException('Unsafe database name');
    $db->exec("CREATE DATABASE `$name` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
    $db->exec("USE `$name`");
    echo "DATABASE=$name (retained; no drop)\n";
    importSql($db, $schema); importSql($db, $seed);
    check((int)$db->query('SELECT COUNT(*) FROM candidates WHERE session_id=1 AND is_finalized=1')->fetchColumn() === 3, 'three finalized candidates belong to initial session');
    check((int)$db->query('SELECT COUNT(*) FROM criteria WHERE session_id=1 AND is_finalized=1')->fetchColumn() === 4, 'four finalized criteria belong to initial session');
    check((int)$db->query('SELECT COUNT(*) FROM assessments')->fetchColumn() === 36, '36 draft assessment values imported');
    $app = new App($db);
    $users = [];
    foreach ([1=>'chair',2=>'member',3=>'member'] as $id=>$role) {
        $users[$id] = $app->login('dm'.$id, 'password123', '127.0.0.1');
        check($users[$id]['role'] === $role, "login dm$id seeded password/role");
    }
    $chair = $users[1];
    check(count($app->listCandidates($chair, 1)) === 3 && count($app->listCriteria($chair, 1)) === 4, 'App reads imported master');
    rejected(fn()=> $app->openVoting($chair, 1), 'early open rejected', 409);
    $voter = $app->register('Observer', 'observer_test', 'password123', '127.0.0.1');
    rejected(fn()=> $app->saveAssessmentsMe($voter, [], 1), 'voter cannot assess', 403);
    foreach ($users as $id=>$user) {
        $items = $db->query("SELECT candidate_id, criterion_id, score FROM assessments WHERE session_id=1 AND user_id=$id")->fetchAll();
        $app->saveAssessmentsMe($user, $items, 1);
        check(count($items) === 12, "saved 12 real scores dm$id");
        $app->finalizeAssessmentsMe($user, 1);
        check((int)$db->query("SELECT is_finalized FROM assessment_status WHERE session_id=1 AND user_id=$id")->fetchColumn() === 1, "finalized dm$id");
    }
    foreach ([1=>[91,85,79],2=>[86,96,78],3=>[95,76,85]] as $id=>$expected) {
        $scores = array_column($app->calculateSawMe($users[$id], 1)['rankings'], 'final_score', 'candidate_id');
        foreach ($expected as $index=>$score) check(abs($scores[$index+1]-$score)<0.001, 'SAW dm'.$id.' candidate'.($index+1).'='.$score);
    }
    $borda = $app->calculateBorda(1)['rankings'];
    $points = array_column($borda, 'borda_points', 'candidate_id');
    $percentages = array_column($borda, 'percentage', 'candidate_id');
    foreach ([1=>[8,44.44],2=>[6,33.33],3=>[4,22.22]] as $id=>$expected) {
        check((int)$points[$id] === $expected[0] && abs($percentages[$id]-$expected[1])<0.01, "Borda candidate$id points/percentage");
    }
    $app->openVoting($chair, 1);
    rejected(fn()=> $app->vote($voter, 1, 1), 'voter cannot cast official vote', 403);
    $app->vote($users[1], 1, 1);
    rejected(fn()=> $app->vote($users[1], 2, 1), 'duplicate vote rejected', 409);
    $app->vote($users[2], 1, 1); $app->vote($users[3], 2, 1);
    $final = $app->approveDecision($chair, 'Integration majority 2-1', 1);
    check((int)$final['candidate_id']===1 && (int)$final['total_votes']===2 && abs($final['percentage']-66.67)<0.01, 'majority 2-1 ratified');
    foreach (array_merge(array_values($users), [$voter]) as $user) {
        $app->getElection($user, 1);
        check((int)$app->getFinalDecision(1)['candidate_id']===1, 'final readable for '.$user['username']);
    }
    // Change credentials and a finalized score to detect any destructive seed replay.
    $db->exec("UPDATE users SET password_hash='preserve-custom-hash' WHERE id=3");
    $db->exec('UPDATE assessments SET score=2 WHERE user_id=3 AND candidate_id=3 AND criterion_id=4');
    $tables = ['users','decision_sessions','candidates','criteria','assessments','assessment_status','voting_rounds','votes','final_decisions','session_voters','audit_logs'];
    $snapshot = function () use ($db, $tables): string {
        $rows=[]; foreach ($tables as $table) $rows[$table]=$db->query("SELECT * FROM `$table` ORDER BY 1,2")->fetchAll();
        return hash('sha256', json_encode($rows));
    };
    $before=$snapshot(); $duplicate=false;
    try { importSql($db,$seed); } catch (PDOException $e) { $duplicate=$e->getCode()==='23000'; }
    check($duplicate && $before===$snapshot(), 'seed rerun rejected with every existing data row unchanged');
    $cycle=$app->createElectionCycle($chair,'Fresh isolation and revote'); $sid=(int)$cycle['session_id'];
    foreach (['candidates','criteria','assessments','assessment_status','voting_rounds','votes','final_decisions'] as $table) {
        check((int)$db->query("SELECT COUNT(*) FROM $table WHERE session_id=$sid")->fetchColumn()===0, "new cycle empty $table");
    }
    check(count($app->listCandidates($chair,$sid))===0 && count($app->listCriteria($chair,$sid))===0, 'new cycle API master isolation');
    rejected(fn()=> $app->saveAssessmentsMe($chair,[['candidate_id'=>1,'criterion_id'=>1,'score'=>5]],$sid), 'old master not accepted by new cycle');
    foreach (['candidates','criteria'] as $table) {
        $nullable=$db->query("SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='$table' AND COLUMN_NAME='session_id'")->fetchColumn();
        check($nullable==='NO', "$table requires session_id");
    }
    $crossRejected=false;
    try { $db->exec("INSERT INTO assessments(session_id,user_id,candidate_id,criterion_id,score) VALUES($sid,1,1,1,5)"); } catch (PDOException $e) { $crossRejected=$e->getCode()==='23000'; }
    check($crossRejected, 'database rejects cross-session assessment references');
    require __DIR__.'/mariadb_extended.php';
    echo "RESULT passed=$passed failed=0\n";
} catch (Throwable $e) {
    fwrite(STDERR, "FAIL " . $e->getMessage() . "\nRESULT passed=$passed failed=1\n"); exit(1);
}
