<?php
// Creates the demo login. Change DEMO_PASS before showing this to anyone you
// don't want to have write access to the demo instance.
const DEMO_USER = 'demo';
const DEMO_PASS = 'avprocure-demo';
$path = $argv[1] ?? __DIR__.'/avprocure-demo.db';
$db = new SQLite3($path); $db->enableExceptions(true);
$db->exec("CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL, is_admin INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now','utc')), last_login TEXT)");
$db->exec("CREATE TABLE IF NOT EXISTS access_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL DEFAULT (datetime('now','utc')),
    username TEXT NOT NULL, ip TEXT, xff TEXT, user_agent TEXT,
    success INTEGER NOT NULL DEFAULT 0, note TEXT)");
$st = $db->prepare('INSERT OR REPLACE INTO users (username,password_hash,is_admin,is_active) VALUES (:u,:h,1,1)');
$st->bindValue(':u', DEMO_USER); $st->bindValue(':h', password_hash(DEMO_PASS, PASSWORD_DEFAULT));
$st->execute();
echo "demo admin '".DEMO_USER."' created (password is set in ".basename(__FILE__).")\n";
