<?php
declare(strict_types=1);
require_once __DIR__ . '/auth.php';

auth_session_start();
auth_seed();

// Must be authenticated and admin
if (!auth_check() || empty($_SESSION['is_admin'])) {
    header('Location: ./');
    exit;
}

$db    = auth_db();
$error = '';
$ok    = '';

// ── Ensure CSRF token ─────────────────────────────────────────────────────────

if (empty($_SESSION['csrf_token'])) {
    $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
}

// ── POST actions ──────────────────────────────────────────────────────────────

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $token_ok = isset($_POST['csrf_token'], $_SESSION['csrf_token'])
             && hash_equals($_SESSION['csrf_token'], $_POST['csrf_token']);

    if (!$token_ok) {
        $error = 'Invalid form submission.';
    } else {
        $action = $_POST['action'] ?? '';

        if ($action === 'create_user') {
            $uname   = trim($_POST['username'] ?? '');
            $pass    = $_POST['password'] ?? '';
            $is_adm  = isset($_POST['is_admin']) ? 1 : 0;
            if ($uname === '' || $pass === '') {
                $error = 'Username and password are required.';
            } elseif (strlen($pass) < 8) {
                $error = 'Password must be at least 8 characters.';
            } else {
                $hash = password_hash($pass, PASSWORD_DEFAULT);
                $stmt = $db->prepare(
                    'INSERT INTO users (username, password_hash, is_admin) VALUES (:u, :h, :a)'
                );
                $stmt->bindValue(':u', $uname,   SQLITE3_TEXT);
                $stmt->bindValue(':h', $hash,    SQLITE3_TEXT);
                $stmt->bindValue(':a', $is_adm,  SQLITE3_INTEGER);
                try {
                    $stmt->execute();
                    $ok = "User '{$uname}' created.";
                } catch (Exception $e) {
                    $error = 'Username already exists.';
                }
            }
        }

        if ($action === 'update_password') {
            $uid  = (int)($_POST['user_id'] ?? 0);
            $pass = $_POST['password'] ?? '';
            if ($uid <= 0 || $pass === '') {
                $error = 'User and password are required.';
            } elseif (strlen($pass) < 8) {
                $error = 'Password must be at least 8 characters.';
            } else {
                $hash = password_hash($pass, PASSWORD_DEFAULT);
                $stmt = $db->prepare('UPDATE users SET password_hash = :h WHERE id = :id');
                $stmt->bindValue(':h',  $hash, SQLITE3_TEXT);
                $stmt->bindValue(':id', $uid,  SQLITE3_INTEGER);
                $stmt->execute();
                $ok = 'Password updated.';
            }
        }

        if ($action === 'toggle_active') {
            $uid = (int)($_POST['user_id'] ?? 0);
            if ($uid === (int)$_SESSION['user_id']) {
                $error = 'You cannot disable your own account.';
            } elseif ($uid > 0) {
                $stmt = $db->prepare(
                    'UPDATE users SET is_active = CASE WHEN is_active = 1 THEN 0 ELSE 1 END WHERE id = :id'
                );
                $stmt->bindValue(':id', $uid, SQLITE3_INTEGER);
                $stmt->execute();
                $ok = 'User status updated.';
            }
        }

        if ($action === 'delete_user') {
            $uid = (int)($_POST['user_id'] ?? 0);
            if ($uid === (int)$_SESSION['user_id']) {
                $error = 'You cannot delete your own account.';
            } elseif ($uid > 0) {
                $stmt = $db->prepare('DELETE FROM users WHERE id = :id');
                $stmt->bindValue(':id', $uid, SQLITE3_INTEGER);
                $stmt->execute();
                $ok = 'User deleted.';
            }
        }
    }
}

// ── Fetch data for display ────────────────────────────────────────────────────

$users = [];
$res   = $db->query('SELECT id, username, is_admin, is_active, created_at, last_login FROM users ORDER BY id');
while ($row = $res->fetchArray(SQLITE3_ASSOC)) {
    $users[] = $row;
}

$logs = [];
$res  = $db->query(
    'SELECT ts, username, ip, xff, user_agent, success, note FROM access_log ORDER BY id DESC LIMIT 200'
);
while ($row = $res->fetchArray(SQLITE3_ASSOC)) {
    $logs[] = $row;
}

$csrf = htmlspecialchars($_SESSION['csrf_token'], ENT_QUOTES);

function h(mixed $v): string {
    return htmlspecialchars((string)$v, ENT_QUOTES | ENT_HTML5, 'UTF-8');
}

header('Content-Type: text/html; charset=UTF-8');
?>
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>AVProcure — Admin</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --bg:      #0f1117;
    --surface: #1a1d27;
    --surface2:#222638;
    --border:  #2e3348;
    --text:    #e2e8f0;
    --muted:   #64748b;
    --accent:  #7c6ef2;
    --accent4: #f472b6;
    --ok:      #4ade80;
    --err:     #f87171;
    --font:    'Space Mono', 'Courier New', monospace;
  }
  body { background:var(--bg); color:var(--text); font-family:var(--font); font-size:13px; }
  a { color:var(--accent); text-decoration:none; }
  a:hover { text-decoration:underline; }

  .topbar {
    display:flex; align-items:center; gap:16px;
    padding:0 24px; height:52px;
    background:var(--surface); border-bottom:1px solid var(--border);
  }
  .topbar h1 { font-size:14px; letter-spacing:0.08em; }
  .topbar .sub { color:var(--muted); font-size:11px; }
  .topbar-right { margin-left:auto; display:flex; gap:8px; }

  .main { max-width:1100px; margin:0 auto; padding:28px 20px; display:flex; flex-direction:column; gap:32px; }

  h2 { font-size:12px; letter-spacing:0.15em; text-transform:uppercase; color:var(--muted); margin-bottom:14px; }

  .card { background:var(--surface); border:1px solid var(--border); border-radius:10px; padding:22px 24px; }

  .notice {
    border-radius:6px; padding:10px 14px; font-size:12px; margin-bottom:18px;
  }
  .notice.ok  { background:rgba(74,222,128,.1); border:1px solid rgba(74,222,128,.3); color:var(--ok); }
  .notice.err { background:rgba(248,113,113,.1); border:1px solid rgba(248,113,113,.3); color:var(--err); }

  table { width:100%; border-collapse:collapse; }
  th { font-size:10px; letter-spacing:0.12em; text-transform:uppercase; color:var(--muted);
       text-align:left; padding:0 10px 10px; }
  td { padding:8px 10px; border-top:1px solid var(--border); vertical-align:middle; }
  tr:hover td { background:var(--surface2); }

  .badge {
    display:inline-block; border-radius:4px; padding:2px 7px; font-size:10px;
    letter-spacing:0.08em; text-transform:uppercase;
  }
  .badge.active   { background:rgba(74,222,128,.15); color:var(--ok); }
  .badge.inactive { background:rgba(248,113,113,.15); color:var(--err); }
  .badge.admin    { background:rgba(124,110,242,.2);  color:var(--accent); }

  .btn {
    background:var(--surface2); border:1px solid var(--border); border-radius:5px;
    color:var(--text); cursor:pointer; font-family:var(--font); font-size:11px;
    padding:5px 10px; transition:opacity .15s;
  }
  .btn:hover { opacity:.75; }
  .btn.danger { border-color:rgba(248,113,113,.4); color:var(--err); }
  .btn.primary {
    background:var(--accent); border-color:var(--accent); color:#fff; font-weight:700;
  }

  .form-grid { display:grid; grid-template-columns:1fr 1fr auto; gap:10px; align-items:end; }
  .form-grid-3 { display:grid; grid-template-columns:auto 1fr 1fr auto; gap:10px; align-items:end; }
  label { display:block; font-size:10px; letter-spacing:0.1em; text-transform:uppercase; color:var(--muted); margin-bottom:4px; }
  input[type=text],input[type=password],select {
    width:100%; background:var(--bg); border:1px solid var(--border); border-radius:5px;
    color:var(--text); font-family:var(--font); font-size:12px; padding:8px 10px; outline:none;
  }
  input:focus,select:focus { border-color:var(--accent); }
  .checkbox-row { display:flex; align-items:center; gap:6px; font-size:12px; margin-top:4px; }

  .log-table { font-size:11px; }
  .log-table td { padding:5px 8px; max-width:220px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .success-1 { color:var(--ok); }
  .success-0 { color:var(--err); }
</style>
</head>
<body>
<div class="topbar">
  <h1>AVProcure</h1>
  <span class="sub">Admin Panel</span>
  <div class="topbar-right">
    <a href="./">← Back to App</a>
    <form method="post" action="./" style="display:inline">
      <input type="hidden" name="action" value="logout">
      <input type="hidden" name="csrf_token" value="<?= $csrf ?>">
      <button type="submit" class="btn danger">⏻ Logout</button>
    </form>
  </div>
</div>

<div class="main">

<?php if ($ok): ?>
  <div class="notice ok"><?= h($ok) ?></div>
<?php endif; ?>
<?php if ($error): ?>
  <div class="notice err"><?= h($error) ?></div>
<?php endif; ?>

<!-- ── Users ── -->
<div class="card">
  <h2>Users</h2>
  <table>
    <thead>
      <tr>
        <th>ID</th><th>Username</th><th>Role</th><th>Status</th>
        <th>Created</th><th>Last Login</th><th>Actions</th>
      </tr>
    </thead>
    <tbody>
    <?php foreach ($users as $u): ?>
    <tr>
      <td><?= h($u['id']) ?></td>
      <td><?= h($u['username']) ?></td>
      <td><?= $u['is_admin'] ? '<span class="badge admin">Admin</span>' : '<span class="badge" style="background:rgba(100,116,139,.15);color:var(--muted)">User</span>' ?></td>
      <td><?= $u['is_active'] ? '<span class="badge active">Active</span>' : '<span class="badge inactive">Disabled</span>' ?></td>
      <td><?= h($u['created_at']) ?></td>
      <td><?= $u['last_login'] ? h($u['last_login']) : '<span style="color:var(--muted)">—</span>' ?></td>
      <td style="display:flex;gap:6px;flex-wrap:wrap">
        <!-- toggle active -->
        <form method="post" style="display:inline">
          <input type="hidden" name="csrf_token" value="<?= $csrf ?>">
          <input type="hidden" name="action" value="toggle_active">
          <input type="hidden" name="user_id" value="<?= h($u['id']) ?>">
          <button type="submit" class="btn"><?= $u['is_active'] ? 'Disable' : 'Enable' ?></button>
        </form>
        <!-- delete -->
        <?php if ((int)$u['id'] !== (int)$_SESSION['user_id']): ?>
        <form method="post" style="display:inline"
              onsubmit="return confirm('Delete user <?= h(addslashes($u['username'])) ?>?')">
          <input type="hidden" name="csrf_token" value="<?= $csrf ?>">
          <input type="hidden" name="action" value="delete_user">
          <input type="hidden" name="user_id" value="<?= h($u['id']) ?>">
          <button type="submit" class="btn danger">Delete</button>
        </form>
        <?php endif; ?>
      </td>
    </tr>
    <?php endforeach; ?>
    </tbody>
  </table>
</div>

<!-- ── Create user ── -->
<div class="card">
  <h2>Create User</h2>
  <form method="post">
    <input type="hidden" name="csrf_token" value="<?= $csrf ?>">
    <input type="hidden" name="action" value="create_user">
    <div class="form-grid">
      <div>
        <label for="new_username">Username</label>
        <input type="text" id="new_username" name="username" autocomplete="off">
      </div>
      <div>
        <label for="new_password">Password</label>
        <input type="password" id="new_password" name="password" autocomplete="new-password">
      </div>
      <div style="padding-bottom:1px">
        <label>&nbsp;</label>
        <div class="checkbox-row">
          <input type="checkbox" name="is_admin" id="new_is_admin" value="1">
          <label for="new_is_admin" style="display:inline;text-transform:none;letter-spacing:0">Admin</label>
        </div>
      </div>
    </div>
    <button type="submit" class="btn primary" style="margin-top:12px">Create User</button>
  </form>
</div>

<!-- ── Change password ── -->
<div class="card">
  <h2>Change Password</h2>
  <form method="post">
    <input type="hidden" name="csrf_token" value="<?= $csrf ?>">
    <input type="hidden" name="action" value="update_password">
    <div class="form-grid-3">
      <div>
        <label for="pw_uid">User</label>
        <select id="pw_uid" name="user_id">
          <?php foreach ($users as $u): ?>
          <option value="<?= h($u['id']) ?>"><?= h($u['username']) ?></option>
          <?php endforeach; ?>
        </select>
      </div>
      <div>
        <label for="pw_new">New Password</label>
        <input type="password" id="pw_new" name="password" autocomplete="new-password">
      </div>
      <div></div><!-- spacer -->
      <div style="padding-bottom:1px">
        <label>&nbsp;</label>
        <button type="submit" class="btn primary">Update Password</button>
      </div>
    </div>
  </form>
</div>

<!-- ── Access log ── -->
<div class="card">
  <h2>Access Log — last 200 entries</h2>
  <table class="log-table">
    <thead>
      <tr>
        <th>Timestamp (UTC)</th><th>Username</th><th>Result</th>
        <th>Note</th><th>IP</th><th>X-Forwarded-For</th><th>User-Agent</th>
      </tr>
    </thead>
    <tbody>
    <?php foreach ($logs as $l): ?>
    <tr>
      <td><?= h($l['ts']) ?></td>
      <td><?= h($l['username']) ?></td>
      <td class="success-<?= (int)$l['success'] ?>"><?= $l['success'] ? 'Success' : 'Failed' ?></td>
      <td><?= h($l['note']) ?></td>
      <td><?= h($l['ip']) ?></td>
      <td><?= h($l['xff']) ?></td>
      <td title="<?= h($l['user_agent']) ?>"><?= h(strlen($l['user_agent']) > 60 ? substr($l['user_agent'], 0, 60) . '…' : $l['user_agent']) ?></td>
    </tr>
    <?php endforeach; ?>
    <?php if (!$logs): ?>
    <tr><td colspan="7" style="color:var(--muted);text-align:center;padding:20px">No log entries yet.</td></tr>
    <?php endif; ?>
    </tbody>
  </table>
</div>

</div><!-- .main -->
</body>
</html>
