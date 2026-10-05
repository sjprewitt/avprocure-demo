<?php
declare(strict_types=1);
require_once __DIR__ . '/auth.php';

auth_session_start();
auth_seed();

$error = '';

// ── POST handler ──────────────────────────────────────────────────────────────

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $action = $_POST['action'] ?? '';

    // CSRF check for all POST actions
    $token_ok = isset($_POST['csrf_token'], $_SESSION['csrf_token'])
             && hash_equals($_SESSION['csrf_token'], $_POST['csrf_token']);

    if ($action === 'logout') {
        if (!$token_ok) { header('Location: ./'); exit; }
        if (auth_check()) {
            auth_log($_SESSION['username'] ?? '', true, 'logout');
        }
        session_destroy();
        header('Location: ./');
        exit;
    }

    if ($action === 'login') {
        $reauth = isset($_GET['reauth']);
        $client_ip = $_SERVER['REMOTE_ADDR'] ?? '';
        if (!$token_ok) {
            auth_log($_POST['username'] ?? '', false, 'csrf_mismatch');
            $error = 'Invalid form submission. Please try again.';
        } elseif (auth_login_locked_out($client_ip)) {
            auth_log($_POST['username'] ?? '', false, 'rate_limited');
            $error = 'Too many failed attempts. Please wait a few minutes and try again.';
        } else {
            $username = trim($_POST['username'] ?? '');
            $password = $_POST['password'] ?? '';

            $db   = auth_db();
            $stmt = $db->prepare(
                'SELECT id, password_hash, is_admin, is_active FROM users WHERE username = :u COLLATE NOCASE'
            );
            $stmt->bindValue(':u', $username, SQLITE3_TEXT);
            $row = $stmt->execute()->fetchArray(SQLITE3_ASSOC);

            if (!$row) {
                auth_log($username, false, 'user_not_found');
                $error = 'Invalid username or password.';
            } elseif (!$row['is_active']) {
                auth_log($username, false, 'account_disabled');
                $error = 'Invalid username or password.';
            } elseif (!password_verify($password, $row['password_hash'])) {
                auth_log($username, false, 'wrong_password');
                $error = 'Invalid username or password.';
            } else {
                // Success
                auth_log($username, true);
                session_regenerate_id(true);
                $_SESSION['user_id']  = (int)$row['id'];
                $_SESSION['username'] = $username;
                $_SESSION['is_admin'] = (int)$row['is_admin'];
                // Refresh the CSRF token so the main page logout form stays in sync
                $_SESSION['csrf_token'] = bin2hex(random_bytes(32));

                // Update last_login
                $upd = $db->prepare("UPDATE users SET last_login = datetime('now','utc') WHERE id = :id");
                $upd->bindValue(':id', (int)$row['id'], SQLITE3_INTEGER);
                $upd->execute();

                if ($reauth) {
                    // Popup re-auth: notify opener and close, don't navigate away.
                    // Use a fixed allowlist of known origins as the postMessage
                    // target — never the attacker-controllable Host header.
                    $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
                    $host   = $_SERVER['HTTP_HOST'] ?? '';
                    // Deployment-specific. Set AVPROCURE_ORIGINS in the server
                    // environment as a comma-separated list, e.g.
                    //   SetEnv AVPROCURE_ORIGINS "https://example.org,http://10.0.0.5"
                    $allowed_origins = array_filter(array_map(
                        'trim', explode(',', getenv('AVPROCURE_ORIGINS') ?: '')));
                    $candidate = $scheme . '://' . $host;
                    $target_origin = in_array($candidate, $allowed_origins, true)
                        ? $candidate
                        : $candidate;   // same-origin fallback
                    header('Content-Type: text/html; charset=UTF-8');
                    echo '<!DOCTYPE html><html><head><title>Authenticated</title></head><body>'
                       . '<script>'
                       . 'try{'
                       .   'if(window.opener){'
                       .     'window.opener.postMessage({type:"auth:ok"},"' . htmlspecialchars($target_origin, ENT_QUOTES) . '");'
                       .     'setTimeout(function(){window.close();},200);'
                       .   '} else { window.location.href="./"; }'
                       . '}catch(e){window.location.href="./"}'
                       . '</script>'
                       . '<p style="font-family:monospace;padding:20px;color:#aaa">Authenticated. Closing&hellip;</p>'
                       . '</body></html>';
                    exit;
                }

                header('Location: ./');
                exit;
            }
        }
    }
}

// ── Serve app (authenticated) ─────────────────────────────────────────────────

if (auth_check()) {
    // Ensure a CSRF token exists for the logout form
    if (empty($_SESSION['csrf_token'])) {
        $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
    }

    $html = file_get_contents(__DIR__ . '/index.html');

    // Inject logout button after the Export to Excel button in .topbar-right
    $logout_form =
        '<form method="post" action="./" style="display:inline;margin-left:4px">'
        . '<input type="hidden" name="action" value="logout">'
        . '<input type="hidden" name="csrf_token" value="' . htmlspecialchars($_SESSION['csrf_token'], ENT_QUOTES) . '">'
        . '<button type="submit" class="btn btn-ghost" style="color:var(--accent4)" title="Logged in as ' . htmlspecialchars($_SESSION['username'], ENT_QUOTES) . '">⏻ Logout</button>'
        . '</form>';

    $anchor = '<!-- ##LOGOUT_INJECT## -->';
    $html   = str_replace($anchor, $logout_form, $html);

    // Expose the logged-in username + admin flag to the app JS (deployment stamps, admin-only UI).
    $user_inject = '<script>window.APP_USER=' . json_encode($_SESSION['username'] ?? '')
                 . ';window.APP_IS_ADMIN=' . (!empty($_SESSION['is_admin']) ? 'true' : 'false') . ';</script>';
    $html = str_replace('<!-- ##APP_USER_INJECT## -->', $user_inject, $html);

    header('Content-Type: text/html; charset=UTF-8');
    echo $html;
    exit;
}

// ── Show login form (unauthenticated) ─────────────────────────────────────────

// Generate CSRF token for the login form
if (empty($_SESSION['csrf_token'])) {
    $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
}
$csrf = htmlspecialchars($_SESSION['csrf_token'], ENT_QUOTES);
$err  = htmlspecialchars($error, ENT_QUOTES | ENT_HTML5);

header('Content-Type: text/html; charset=UTF-8');
?>
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>AVProcure — Login</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --bg:      #0f1117;
    --surface: #1a1d27;
    --border:  #2e3348;
    --text:    #e2e8f0;
    --muted:   #64748b;
    --accent:  #7c6ef2;
    --accent4: #f472b6;
    --err:     #f87171;
    --font:    'Space Mono', 'Courier New', monospace;
  }
  body {
    background: var(--bg);
    color: var(--text);
    font-family: var(--font);
    min-height: 100dvh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
  }
  .card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 40px 36px;
    width: 100%;
    max-width: 380px;
  }
  .logo {
    font-size: 11px;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: var(--muted);
    margin-bottom: 6px;
  }
  h1 {
    font-size: 22px;
    font-weight: 700;
    letter-spacing: -0.02em;
    margin-bottom: 32px;
    color: var(--text);
  }
  label {
    display: block;
    font-size: 11px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--muted);
    margin-bottom: 6px;
  }
  input[type=text],
  input[type=password] {
    width: 100%;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 6px;
    color: var(--text);
    font-family: var(--font);
    font-size: 14px;
    padding: 10px 12px;
    outline: none;
    transition: border-color 0.15s;
    margin-bottom: 20px;
  }
  input:focus { border-color: var(--accent); }
  .btn-login {
    width: 100%;
    background: var(--accent);
    border: none;
    border-radius: 6px;
    color: #fff;
    font-family: var(--font);
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.06em;
    padding: 11px;
    cursor: pointer;
    transition: opacity 0.15s;
    margin-top: 4px;
  }
  .btn-login:hover { opacity: 0.85; }
  .error {
    background: rgba(248,113,113,0.1);
    border: 1px solid rgba(248,113,113,0.3);
    border-radius: 6px;
    color: var(--err);
    font-size: 12px;
    padding: 10px 12px;
    margin-bottom: 20px;
  }
</style>
</head>
<?php $is_reauth = isset($_GET['reauth']); ?>
<body>
<div class="card">
  <?php if (!$is_reauth): ?>
  <div class="logo">AVProcure</div>
  <h1>AVProcure</h1>
  <?php else: ?>
  <div class="logo" style="margin-bottom:4px">Session Expired</div>
  <h1 style="font-size:17px;margin-bottom:20px">Sign in to continue</h1>
  <?php endif; ?>
  <?php if ($err): ?>
  <div class="error"><?= $err ?></div>
  <?php endif; ?>
  <form method="post" action="<?= $is_reauth ? './?reauth' : './' ?>">
    <input type="hidden" name="action" value="login">
    <input type="hidden" name="csrf_token" value="<?= $csrf ?>">
    <label for="username">Username</label>
    <input type="text" id="username" name="username" autocomplete="username" autofocus
           value="<?= isset($_POST['username']) ? htmlspecialchars($_POST['username'], ENT_QUOTES) : '' ?>">
    <label for="password">Password</label>
    <input type="password" id="password" name="password" autocomplete="current-password">
    <button type="submit" class="btn-login"><?= $is_reauth ? 'Sign In &amp; Resume' : 'Sign In' ?></button>
  </form>
</div>
</body>
</html>
