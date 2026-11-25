<?php
declare(strict_types=1);
require_once __DIR__.'/../src/DecisionService.php';
require_once __DIR__.'/../src/App.php';
[$script,$name,$operation,$sid,$candidate] = $argv;
if (!preg_match('/^gdss_pilpress_fresh_test_[a-zA-Z0-9_]+$/D',$name)) exit(2);
$db=new PDO("mysql:host=127.0.0.1;port=3307;dbname=$name;charset=utf8mb4",'root','',[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC,PDO::ATTR_EMULATE_PREPARES=>false]);
$user=$db->query('SELECT id,username,name,role FROM users WHERE id=1')->fetch();
echo "READY\n"; flush();
fgets(STDIN);
try {
 $app=new Gdss\App($db);
 if ($operation==='vote') $app->vote($user,(int)$candidate,(int)$sid);
 elseif ($operation==='approve') $app->approveDecision($user,'Concurrent ratification',(int)$sid);
 else throw new RuntimeException('Unknown operation');
 echo "200\n";
} catch (Gdss\ApiError $e) { echo $e->httpStatus."\n"; }
