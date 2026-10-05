<?php
// Creates an empty AVProcure database using the application's own create_schema(),
// extracted from api.php at run time so the demo schema can never drift from production.
$src = file_get_contents(__DIR__.'/../api.php');
if (!preg_match('/^function create_schema\(SQLite3 \$db\): void \{.*?^\}/ms', $src, $m)) {
    fwrite(STDERR, "could not locate create_schema() in api.php\n"); exit(1);
}
eval($m[0]);
$path = $argv[1] ?? __DIR__.'/avprocure-demo.db';
if (file_exists($path)) { fwrite(STDERR, "refusing to overwrite existing $path\n"); exit(1); }
$db = new SQLite3($path); $db->enableExceptions(true);
create_schema($db);
$r = $db->query("select count(*) c from sqlite_master where type='table' and name not like 'sqlite_%'");
echo "created $path — ".$r->fetchArray(SQLITE3_ASSOC)['c']." tables\n";
