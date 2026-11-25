<?php
declare(strict_types=1);
// Included by fresh harness: every operation targets its newly created database.
function race(PDO $db,string $name,string $operation,int $sid,int $candidate): void {
    $workers=[];
    try {
        $db->beginTransaction();
        $db->query("SELECT id FROM decision_sessions WHERE id=$sid FOR UPDATE")->fetch();
        for($i=0;$i<2;$i++) {
            $p=proc_open([PHP_BINARY,__DIR__.'/mariadb_race_worker.php',$name,$operation,(string)$sid,(string)$candidate],[0=>['pipe','r'],1=>['pipe','w'],2=>['pipe','w']],$pipes);
            if(!is_resource($p)) throw new RuntimeException('Worker launch failed');
            $workers[]=[$p,$pipes];
            if(trim(fgets($pipes[1]))!=='READY') throw new RuntimeException('Worker not ready');
        }
        foreach($workers as [$p,$pipes]) { fwrite($pipes[0],"GO\n"); fflush($pipes[0]); }
        usleep(300000); // Both independent connections contend for held session row.
        $db->commit();
        $statuses=[];
        foreach($workers as [$p,$pipes]) {
            fclose($pipes[0]); $statuses[]=(int)trim(stream_get_contents($pipes[1]));
            $err=stream_get_contents($pipes[2]); fclose($pipes[1]); fclose($pipes[2]);
            if(proc_close($p)!==0 || $err!=='') throw new RuntimeException('Race worker error: '.$err);
        }
        $workers=[]; sort($statuses);
        check($statuses===[200,409],"concurrent $operation: exactly one success and one conflict");
    } finally {
        if($db->inTransaction()) $db->rollBack();
        foreach($workers as [$p,$pipes]) if(is_resource($p)) proc_terminate($p);
    }
}
$oldHistory=$app->getDecisionsHistory(1);
$ids=[];
foreach(['A','B','C'] as $label) $ids[]=(int)$app->createCandidate($chair,['name'=>'Cycle two '.$label],null,$sid)['id'];
$criterion=(int)$app->createCriterion($chair,['name'=>'New criterion','weight'=>100,'type'=>'benefit'],null,$sid)['id'];
$app->finalizeCandidates($chair,null,$sid); $app->finalizeCriteria($chair,null,$sid);
foreach($users as $user) {
    $items=[]; foreach($ids as $id) $items[]=['candidate_id'=>$id,'criterion_id'=>$criterion,'score'=>5];
    $app->saveAssessmentsMe($user,$items,$sid); $app->finalizeAssessmentsMe($user,$sid);
}
$app->openVoting($chair,$sid);
foreach($users as $n=>$user) $app->vote($user,$ids[$n-1],$sid);
check($app->getVotingResults($sid)['session_status']==='tie_revote','new cycle 1-1-1 requires revote');
rejected(fn()=> $app->approveDecision($chair,'Cannot approve tie',$sid),'tie ratification forbidden',409);
$round1=$db->query("SELECT * FROM votes WHERE session_id=$sid ORDER BY id")->fetchAll();
$electorate=$db->query("SELECT user_id FROM session_voters WHERE session_id=$sid ORDER BY user_id")->fetchAll();
check($app->nextRoundVoting($chair,$sid)['round_number']===2,'round two opened');
check($electorate===$db->query("SELECT user_id FROM session_voters WHERE session_id=$sid ORDER BY user_id")->fetchAll(),'revote electorate unchanged');
race($db,$name,'vote',$sid,$ids[0]);
$app->vote($users[2],$ids[0],$sid); $app->vote($users[3],$ids[1],$sid);
race($db,$name,'approve',$sid,$ids[0]);
check((int)$db->query("SELECT COUNT(*) FROM final_decisions WHERE session_id=$sid")->fetchColumn()===1,'one persisted final after racing ratifications');
check((int)$db->query("SELECT COUNT(*) FROM audit_logs WHERE session_id=$sid AND action='decision_approve'")->fetchColumn()===1,'one ratification audit entry');
$history=$app->getDecisionsHistory($sid);
check(count($history['rounds'])===2 && $history['rounds'][0]['evaluation']['status']==='tie_revote' && $history['rounds'][1]['evaluation']['status']==='majority','history contains tie and majority rounds');
check((int)$history['final_decision']['round_number']===2 && (int)$history['final_decision']['candidate_id']===$ids[0],'round two winner persisted');
check($round1===$db->query("SELECT * FROM votes WHERE session_id=$sid ORDER BY id LIMIT 3")->fetchAll(),'round one ballots preserved');
check($oldHistory===$app->getDecisionsHistory(1),'prior election history unchanged');
require __DIR__.'/mariadb_http.php';
