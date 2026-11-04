<?php
declare(strict_types=1);
if(PHP_SAPI!=='cli') { http_response_code(404); exit; }
require_once __DIR__.'/../src/bootstrap.php';
if($argc!==4) { fwrite(STDERR,"Usage: php tools/provision.php <username> <password> <role:chair|member>\n"); exit(2); }
[$script,$username,$password,$role]=$argv;
if(!preg_match('/^[a-zA-Z0-9_]{3,40}$/',$username)||strlen($password)<12||!in_array($role,['chair','member'],true)) { fwrite(STDERR,"Invalid username, password (min 12 chars), or role.\n"); exit(2); }
$db=database(); $stmt=$db->prepare('UPDATE users SET password_hash=? WHERE username=? AND role=?'); $stmt->execute([password_hash($password,PASSWORD_DEFAULT),$username,$role]);
if(!$stmt->rowCount()) { fwrite(STDERR,"No matching account updated.\n"); exit(1); }
printf("Provisioned %s (%s).\n",$username,$role);
