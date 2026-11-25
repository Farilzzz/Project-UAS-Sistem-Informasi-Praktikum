<?php
declare(strict_types=1);
function requestTest(string $base,string $method,string $path,?array $body=null,?string $token=null,string $origin=''): array {
    $ch=curl_init($base.$path); $headers=['Content-Type: application/json'];
    if($token!==null) $headers[]='Authorization: Bearer '.$token;
    if($origin!=='') $headers[]='Origin: '.$origin;
    curl_setopt_array($ch,[CURLOPT_CUSTOMREQUEST=>$method,CURLOPT_HTTPHEADER=>$headers,CURLOPT_RETURNTRANSFER=>true,CURLOPT_HEADER=>true,CURLOPT_TIMEOUT=>10]);
    if($body!==null) curl_setopt($ch,CURLOPT_POSTFIELDS,json_encode($body));
    $raw=curl_exec($ch); if($raw===false) throw new RuntimeException(curl_error($ch));
    $size=curl_getinfo($ch,CURLINFO_HEADER_SIZE); $code=curl_getinfo($ch,CURLINFO_HTTP_CODE); curl_close($ch);
    return [$code,json_decode(substr($raw,$size),true),strtolower(substr($raw,0,$size))];
}
$socket=stream_socket_server('tcp://127.0.0.1:0',$errno,$error);
if(!$socket) throw new RuntimeException($error);
$address=stream_socket_get_name($socket,false); fclose($socket);
$base='http://'.$address;
$key=bin2hex(random_bytes(32));
$env=getenv(); $env['DB_DSN']="mysql:host=127.0.0.1;port=3307;dbname=$name;charset=utf8mb4";
$env['DB_USER']='root'; $env['DB_PASSWORD']=''; $env['APP_KEY']=$key; $env['CORS_ALLOWED_ORIGINS']='http://allowed.test';
$scratch=PHP_OS_FAMILY==='Windows' ? getenv('LOCALAPPDATA').'/hermes/cache/scratch' : (getenv('TMPDIR') ?: sys_get_temp_dir());
if(!is_dir($scratch)) throw new RuntimeException('Scratch directory unavailable');
$log=tempnam($scratch,'gdss_http_');
$server=proc_open([PHP_BINARY,'-S',$address,__DIR__.'/../public/index.php'],[0=>['pipe','r'],1=>['file',$log,'a'],2=>['file',$log,'a']],$pipes,__DIR__,$env);
if(!is_resource($server)) throw new RuntimeException('HTTP server failed');
try {
    $ready=false; for($i=0;$i<50;$i++) { $probe=@fsockopen('127.0.0.1',(int)explode(':',$address)[1]); if($probe) { fclose($probe);$ready=true;break; } usleep(100000); }
    check($ready,'isolated HTTP server reachable'); echo "HTTP_BASE=$base LOG=$log\n";
    [$code,$response]=requestTest($base,'POST','/api/auth/login',['username'=>'dm1','password'=>'password123']);
    check($code===200 && isset($response['data']['token']),'HTTP seeded login issues token'); $token=$response['data']['token'];
    [$code,$response]=requestTest($base,'GET','/api/auth/me',null,$token);
    check($code===200 && $response['data']['username']==='dm1','HTTP bearer authentication');
    check(requestTest($base,'GET','/api/auth/me')[0]===401,'HTTP missing authentication rejected');
    check(requestTest($base,'GET','/api/candidates')[0]===401,'HTTP anonymous master access rejected');
    check(requestTest($base,'GET','/api/auth/me',null,$token.'x')[0]===401,'HTTP tampered token rejected');
    $b64=fn(string $s)=>rtrim(strtr(base64_encode($s),'+/','-_'),'=');
    $payload=$b64(json_encode(['sub'=>1,'exp'=>time()-60]));
    $expired=$payload.'.'.$b64(hash_hmac('sha256',$payload,$key,true));
    check(requestTest($base,'GET','/api/auth/me',null,$expired)[0]===401,'HTTP valid signature expired token rejected');
    [$code,$member]=requestTest($base,'POST','/api/auth/login',['username'=>'dm2','password'=>'password123']);
    check($code===200,'HTTP member login');
    check(requestTest($base,'POST','/api/criteria',['name'=>'Unauthorized','weight'=>100],$member['data']['token'])[0]===403,'HTTP member master mutation forbidden');
    check(requestTest($base,'POST','/api/auth/login',['username'=>"dm1' OR '1'='1",'password'=>'wrong'])[0]===401,'HTTP SQL injection login cannot bypass authentication');
    check(requestTest($base,'GET','/api/candidates?session_id=1%20OR%201%3D1',null,$token)[0]===422,'HTTP SQL injection session identifier rejected');
    [$code,,$headers]=requestTest($base,'OPTIONS','/api/candidates',null,null,'http://allowed.test');
    check($code===204 && str_contains($headers,'access-control-allow-origin: http://allowed.test'),'HTTP allowed CORS preflight');
    [$code,,$headers]=requestTest($base,'OPTIONS','/api/candidates',null,null,'http://evil.test');
    check($code===204 && !str_contains($headers,'access-control-allow-origin:'),'HTTP disallowed origin receives no CORS permission');
    check((int)$db->query('SELECT COUNT(*) FROM users')->fetchColumn()===4,'HTTP injection probes preserve users');
} finally {
    fclose($pipes[0]); proc_terminate($server); proc_close($server);
}
