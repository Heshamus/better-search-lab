# Better Search Lab Marketing Website — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `bettersearchlab.com` marketing website — a fast, static-first custom PHP/HTML site of five pages plus one email-capture endpoint, styled as an extension of the product's "Daylight" design system, optimized for SEO/GEO/AEO, showing zero AI-generated-website tells.

**Architecture:** Flat PHP files at the web root compose shared includes (`head`, `header`, `footer`, `nav`, `schema`); one hand-written stylesheet and one small JS file; one `subscribe.php` endpoint whose logic lives in pure, unit-tested functions in `inc/subscribe-lib.php`. No framework, no build step, no package manager for the shipped site. A dependency-free PHP test harness (pure-function unit tests + HTTP render-tests via `php -S`) verifies behavior, required facts, and the anti-AI-tell rules.

**Tech Stack:** PHP 8.x (CLI available for tests; runs on Hostinger Apache/LiteSpeed), HTML5, one CSS file, one vanilla JS file, self-hosted Hanken Grotesk woff2. No Composer/npm for the shipped artifact; the test harness is plain PHP run with the `php` CLI.

**Spec:** `docs/superpowers/specs/2026-09-12-bettersearchlab-marketing-site-design.md` — READ IT FIRST and in full. This plan argues from that spec; where a task says "copy per spec §10.x", the exact prose lives there and must be used verbatim. Every fact, number, URL, and command is real — never invent alternatives.

## Workspace (read before Task 1)

- Build the site in a **new standalone git repository**, not inside the product repo. Suggested root: a fresh directory `bettersearchlab-website/` with its own `git init`. All file paths in this plan are **relative to that repo root**. All `git commit` steps happen in that repo.
- The deployable web root is `public_html/`. Everything outside it (`tests/`, `docs/`, `README.md`, `.gitignore`) is dev-only and is NOT uploaded to Hostinger.
- Do NOT add these files to the Next.js product repo's history.

## Global Constraints

Every task implicitly includes these (verbatim from the spec):

- **Canonical host:** apex `https://bettersearchlab.com` (www + http 301 → apex). No trailing slashes; links are extensionless (`/features`, not `/features.php`).
- **Design is light-only** (`color-scheme: light`); ground `#f6f7f9`, ink `#161a20`, hairline `#e7e9ee`, radius `12px`. **Evergreen `#157f5c` appears ONLY on data** (deltas, pills, sparklines, link-hover underline) — never on buttons, headings, nav, or chrome.
- **Typeface:** Hanken Grotesk, **self-hosted** woff2 (400/500/600/700), `font-display:swap`, preload 400+600. No font CDN. One typeface only.
- **Forbidden — visual:** gradients, glassmorphism/blur/3D, emoji, everything-centered layouts, radius+shadow on every block, accent bar/rail on cards, Inter/Space Grotesk, stock/abstract hero illustrations, fake logo clouds.
- **Forbidden — copy:** hype/empty words (supercharge, unlock, unleash, revolutionize, effortless(ly), seamless(ly), game-changing, cutting-edge, leverage, utilize, empower, world-class, best-in-class, robust, solution); fabricated social proof (testimonials, ratings, user counts); rhetorical-question subheads; exclamation marks; ALL-CAPS except the small uppercase eyebrow label.
- **Honesty is structural:** never print a number you cannot verify against the spec or the live demo. Sentence case for headings.
- **Contact address:** `hello@bettersearchlab.com` only — never a personal email. No secrets committed (`inc/secrets.php` and `data/` are gitignored; `inc/secrets.sample.php` is committed).
- **CSP has no `'unsafe-inline'`** → no inline styles or inline event handlers anywhere; JS attaches listeners in `site.js`; JSON-LD (`type="application/ld+json"`, non-executable) is allowed.
- **Repo framing:** GitLab `https://gitlab.com/betterbrainlab/better-search-lab` is canonical/primary; GitHub `https://github.com/Heshamus/better-search-lab` is "also on GitHub", secondary.
- **Verbatim strings:** demo `https://thefamoushesham-better-search-lab-demo.hf.space`; install `curl -fsSL https://gitlab.com/betterbrainlab/better-search-lab/-/raw/main/install.sh | sh` (append ` -s -- --demo` for demo mode); tagline "Search & GEO visibility"; eyebrow `SEARCH & GEO VISIBILITY`; license AGPL-3.0-only; "~$0.37 to map a 150-keyword site"; built by Harperflow (harperflow.io) + Hesham (hesham.us).
- **Commits:** end every commit message with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

## File structure (created across the tasks below)

```
bettersearchlab-website/                 (git repo root — NOT deployed)
├─ public_html/                          (uploads to Hostinger web root)
│  ├─ index.php  features.php  install.php  faq.php  privacy.php   (pages)
│  ├─ subscribe.php  404.php                                       (endpoint + error)
│  ├─ .htaccess  robots.txt  sitemap.xml  llms.txt  site.webmanifest
│  ├─ favicon.ico
│  ├─ inc/  config.php  secrets.sample.php  secrets.php(gitignored)
│  │       nav.php  schema.php  head.php  header.php  footer.php
│  │       subscribe-lib.php  lib/PHPMailer/(vendored, optional)
│  ├─ assets/ css/styles.css  js/site.js  fonts/*.woff2
│  │          img/*(screenshots+logo)  og/*(1200x630)  icons/*
│  └─ data/(gitignored, runtime)  subscribers.csv
├─ tests/  lib.php  run.php  router.php  run.sh
│         unit/subscribe-test.php  render/pages-test.php  static/checks-test.php
├─ .gitignore   README.md
```

## Testing approach (how every task verifies)

- **Unit tests** (`tests/unit/*`): include `inc/subscribe-lib.php` directly and assert on pure functions. No server, no network.
- **Render tests** (`tests/render/*`): `tests/run.sh` boots `php -S 127.0.0.1:8080 -t public_html tests/router.php` (the router mimics `.htaccess` clean-URL rewrites for local testing), waits for readiness, runs `php tests/run.php`, then kills the server. Tests fetch pages over HTTP with `t_http()` and assert status codes, required strings, single `<h1>`, valid JSON-LD, and **absence** of every forbidden word/emoji.
- **Static checks** (`tests/static/*`): `php -l` lint all PHP; grep the tree for committed secrets; assert `.htaccess`/`robots.txt`/`sitemap.xml`/`llms.txt` contain required directives; assert generated assets exist with correct dimensions.
- **Run everything:** `bash tests/run.sh`. Exit code 0 = all green.

---
### Task 1: Project scaffold, config, and test harness

**Files:**
- Create: `.gitignore`, `README.md`, `public_html/inc/config.php`, `public_html/inc/secrets.sample.php`, `tests/lib.php`, `tests/run.php`, `tests/router.php`, `tests/run.sh`, `tests/bootstrap-test.php`

**Interfaces:**
- Produces: constants `SITE_URL, SITE_NAME, TAGLINE, DEMO_URL, GITLAB_URL, GITHUB_URL, CONTACT_EMAIL, ANALYTICS_PROVIDER, ANALYTICS_DOMAIN, ANALYTICS_HOST, INSTALL_CMD, INSTALL_CMD_DEMO`; helper `e(string):string`; test helpers `t_ok, t_contains, t_icontains, t_absent, t_eq, t_count, t_json_ok, t_http, t_header_has, t_report`.

- [ ] **Step 1: Write the failing test** — `tests/bootstrap-test.php`

```php
<?php
require __DIR__.'/../public_html/inc/config.php';
t_eq(SITE_URL,'https://bettersearchlab.com','SITE_URL is the apex');
t_eq(DEMO_URL,'https://thefamoushesham-better-search-lab-demo.hf.space','demo URL exact');
t_eq(CONTACT_EMAIL,'hello@bettersearchlab.com','role contact email');
t_contains(INSTALL_CMD,'curl -fsSL https://gitlab.com/betterbrainlab/better-search-lab/-/raw/main/install.sh | sh','install cmd exact');
t_contains(INSTALL_CMD_DEMO,'-s -- --demo','demo variant appends flag');
t_eq(e('<a href="x">&'),'&lt;a href=&quot;x&quot;&gt;&amp;','e() escapes HTML+quotes');
```

- [ ] **Step 2: Run to verify it fails** — `BSL_SKIP_RENDER=1 php tests/run.php` → FAIL (config/helpers not defined).

- [ ] **Step 3: Implement the harness** — `tests/lib.php`

```php
<?php
$GLOBALS['T']=['pass'=>0,'fail'=>0,'msgs'=>[]];
function t_ok($c,$m){ if($c){$GLOBALS['T']['pass']++;} else {$GLOBALS['T']['fail']++;$GLOBALS['T']['msgs'][]="FAIL: $m";} }
function t_contains($h,$n,$m){ t_ok(is_string($h)&&strpos($h,$n)!==false,"$m [missing: $n]"); }
function t_icontains($h,$n,$m){ t_ok(is_string($h)&&stripos($h,$n)!==false,"$m [missing: $n]"); }
function t_absent($h,$n,$m){ t_ok(is_string($h)&&stripos($h,$n)===false,"$m [found: $n]"); }
function t_eq($a,$b,$m){ t_ok($a===$b,"$m [got=".var_export($a,true)." want=".var_export($b,true)."]"); }
function t_count($h,$n,$want,$m){ $c=substr_count((string)$h,$n); t_ok($c===$want,"$m [count '$n'=$c want $want]"); }
function t_json_ok($json,$m){ $d=json_decode((string)$json,true); t_ok($d!==null,"$m [invalid JSON]"); return $d; }
function t_http($method,$url,$data=null,$headers=[],$follow=true){
  $h=$headers ?: ['Accept: text/html'];
  $opt=['http'=>['method'=>$method,'ignore_errors'=>true,'follow_location'=>$follow?1:0,'timeout'=>10]];
  if($data!==null){ $opt['http']['content']=http_build_query($data); $h[]='Content-Type: application/x-www-form-urlencoded'; }
  $opt['http']['header']=implode("\r\n",$h);
  $body=@file_get_contents($url,false,stream_context_create($opt));
  $status=0; $hdrs=$http_response_header ?? [];
  if(isset($hdrs[0])&&preg_match('#\s(\d{3})\s#',$hdrs[0],$mm)) $status=(int)$mm[1];
  return ['status'=>$status,'body'=>$body===false?'':$body,'headers'=>$hdrs];
}
function t_header_has(array $hdrs,$needle){ foreach($hdrs as $h){ if(stripos($h,$needle)!==false) return true;} return false; }
function t_report(){ $r=$GLOBALS['T']; foreach($r['msgs'] as $x) fwrite(STDERR,$x."\n"); fwrite(STDOUT,"\n{$r['pass']} passed, {$r['fail']} failed\n"); exit($r['fail']>0?1:0); }
```

`tests/run.php` (auto-discovers test files; render/* need the server from `run.sh`, everything else runs in-process):

```php
<?php
require __DIR__.'/lib.php';
$groups=[
  glob(__DIR__.'/*-test.php') ?: [],          // bootstrap
  glob(__DIR__.'/unit/*-test.php') ?: [],      // pure-function units
  glob(__DIR__.'/inproc/*-test.php') ?: [],    // in-process renders (no server)
  glob(__DIR__.'/static/*-test.php') ?: [],    // file/content greps
  getenv('BSL_SKIP_RENDER') ? [] : (glob(__DIR__.'/render/*-test.php') ?: []), // HTTP renders
];
foreach($groups as $g){ sort($g); foreach($g as $f) require $f; }
t_report();
```

`tests/router.php` (dev-only; emulates `.htaccess` clean URLs for `php -S`):

```php
<?php
$uri=rtrim(parse_url($_SERVER['REQUEST_URI'],PHP_URL_PATH),'/'); if($uri==='') $uri='/';
$root=$_SERVER['DOCUMENT_ROOT'];
if($uri!=='/' && is_file($root.$uri)) return false;               // real static file / *.php
$map=['/'=>'/index.php','/features'=>'/features.php','/install'=>'/install.php','/faq'=>'/faq.php','/privacy'=>'/privacy.php','/subscribe'=>'/subscribe.php'];
if(isset($map[$uri])){ require $root.$map[$uri]; return true; }
http_response_code(404); if(is_file($root.'/404.php')) require $root.'/404.php'; else echo '404';
```

`tests/run.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
php -S 127.0.0.1:8080 -t public_html tests/router.php >/tmp/bsl_srv.log 2>&1 &
SRV=$!; trap 'kill $SRV 2>/dev/null || true' EXIT
for i in $(seq 1 40); do curl -fsS -o /dev/null http://127.0.0.1:8080/ 2>/dev/null && break; sleep 0.2; done
php tests/run.php
```

- [ ] **Step 4: Implement `public_html/inc/config.php`**

```php
<?php
if (defined('BSL_CONFIG')) return;
define('BSL_CONFIG',1);
define('SITE_URL','https://bettersearchlab.com');
define('SITE_NAME','Better Search Lab');
define('TAGLINE','Search & GEO visibility');
define('DEMO_URL','https://thefamoushesham-better-search-lab-demo.hf.space');
define('GITLAB_URL','https://gitlab.com/betterbrainlab/better-search-lab');
define('GITHUB_URL','https://github.com/Heshamus/better-search-lab');
define('CONTACT_EMAIL','hello@bettersearchlab.com');
define('ANALYTICS_PROVIDER','plausible');           // 'plausible' | 'ga4' | 'none'
define('ANALYTICS_DOMAIN','bettersearchlab.com');
define('ANALYTICS_HOST','https://plausible.io');    // host allowed in CSP
define('INSTALL_CMD','curl -fsSL '.GITLAB_URL.'/-/raw/main/install.sh | sh');
define('INSTALL_CMD_DEMO', INSTALL_CMD.' -s -- --demo');
function e($s){ return htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8'); }
```

`public_html/inc/secrets.sample.php`:

```php
<?php
// Copy to inc/secrets.php on the server and fill in. NEVER commit secrets.php.
return [
  'SMTP_HOST'=>'', 'SMTP_PORT'=>'587', 'SMTP_USER'=>'', 'SMTP_PASS'=>'',
  'SMTP_FROM'=>'hello@bettersearchlab.com', 'SMTP_SECURE'=>'tls',
  'IP_SALT'=>'change-this-to-a-random-string',
];
```

`.gitignore`:

```
public_html/inc/secrets.php
public_html/data/
/tmp/
.DS_Store
```

`README.md`: a short dev+deploy readme (how to run `bash tests/run.sh`; that `public_html/` is the deploy root; link to the spec). Fill the Hostinger deploy steps in Task 16.

- [ ] **Step 5: Run to verify pass** — `BSL_SKIP_RENDER=1 php tests/run.php` → PASS. Also `php -l public_html/inc/config.php`.

- [ ] **Step 6: Commit**

```bash
git init 2>/dev/null; git add -A
git commit -m "chore: scaffold site, config, and dependency-free PHP test harness

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Subscribe logic (pure, unit-tested functions)

**Files:**
- Create: `public_html/inc/subscribe-lib.php`, `tests/unit/subscribe-test.php`

**Interfaces:**
- Produces: `bsl_validate_email(?string):?string` (returns normalized email or null); `bsl_is_honeypot(array):bool`; `bsl_is_too_fast(array,int=2000):bool`; `bsl_ip_hash(string,string):string`; `bsl_append_subscriber(string $file,string $email,string $ipHash,?int $ts=null):bool`; `bsl_rate_limited(string $dir,string $ipHash,int $max=5,int $windowSec=3600,?int $now=null):bool`; `bsl_notify(callable $sender,string $email):bool` (fail-soft — never throws).

- [ ] **Step 1: Write the failing test** — `tests/unit/subscribe-test.php`

```php
<?php
require __DIR__.'/../../public_html/inc/subscribe-lib.php';
$tmp=sys_get_temp_dir().'/bsl_'.uniqid(); @mkdir($tmp,0755,true);
// validation
t_eq(bsl_validate_email('you@example.com'),'you@example.com','valid email passes');
t_eq(bsl_validate_email('nope'),null,'invalid email rejected');
t_eq(bsl_validate_email(''),null,'empty rejected');
t_eq(bsl_validate_email(str_repeat('a',260).'@x.com'),null,'overlong rejected');
// honeypot
t_ok(bsl_is_honeypot(['company'=>'bot']),'filled honeypot -> bot');
t_ok(!bsl_is_honeypot(['company'=>'']),'empty honeypot -> human');
t_ok(!bsl_is_honeypot([]),'missing honeypot -> human');
// timing
t_ok(bsl_is_too_fast(['t'=>'500']),'t<2000 -> too fast');
t_ok(!bsl_is_too_fast(['t'=>'5000']),'t>=2000 -> ok');
t_ok(!bsl_is_too_fast([]),'missing t -> allowed (no-JS)');
// append + flock
$csv=$tmp.'/subscribers.csv';
t_ok(bsl_append_subscriber($csv,'a@b.com','deadbeefcafe0001',1700000000),'append returns true');
$c=file_get_contents($csv); t_contains($c,'a@b.com','csv has email'); t_contains($c,'deadbeefcafe0001','csv has ip hash');
// rate limit
$rl=$tmp.'/rl';
for($i=0;$i<5;$i++){ t_ok(!bsl_rate_limited($rl,'aaa',5,3600,1700000000),"hit $i under limit"); }
t_ok(bsl_rate_limited($rl,'aaa',5,3600,1700000000),'6th hit limited');
t_ok(!bsl_rate_limited($rl,'bbb',5,3600,1700000000),'different ip not limited');
// notify fail-soft
t_ok(bsl_notify(fn($e)=>true,'a@b.com'),'notify success -> true');
t_ok(!bsl_notify(function($e){ throw new RuntimeException('smtp down'); },'a@b.com'),'notify throw -> false (fail-soft)');
```

- [ ] **Step 2: Run to verify it fails** — `BSL_SKIP_RENDER=1 php tests/run.php` → FAIL (functions undefined).

- [ ] **Step 3: Implement** — `public_html/inc/subscribe-lib.php`

```php
<?php
if (function_exists('bsl_validate_email')) return;
function bsl_validate_email(?string $raw): ?string {
  $e=trim((string)$raw); if($e===''||strlen($e)>254) return null;
  $v=filter_var($e,FILTER_VALIDATE_EMAIL); return $v===false?null:$v;
}
function bsl_is_honeypot(array $p): bool { return isset($p['company']) && trim((string)$p['company'])!==''; }
function bsl_is_too_fast(array $p,int $minMs=2000): bool {
  if(!isset($p['t'])||$p['t']==='') return false; $t=(int)$p['t']; return $t>0 && $t<$minMs;
}
function bsl_ip_hash(string $ip,string $salt): string { return substr(hash('sha256',$ip.'|'.$salt),0,16); }
function bsl_append_subscriber(string $file,string $email,string $ipHash,?int $ts=null): bool {
  $ts=$ts??time(); $dir=dirname($file); if(!is_dir($dir)) @mkdir($dir,0755,true);
  $fh=@fopen($file,'ab'); if(!$fh) return false; $ok=false;
  if(flock($fh,LOCK_EX)){ $ok=fwrite($fh,gmdate('c',$ts).",$email,$ipHash\n")!==false; fflush($fh); flock($fh,LOCK_UN); }
  fclose($fh); return $ok;
}
function bsl_rate_limited(string $dir,string $ipHash,int $max=5,int $windowSec=3600,?int $now=null): bool {
  $now=$now??time(); if(!is_dir($dir)) @mkdir($dir,0755,true);
  $f=$dir.'/rl_'.preg_replace('/[^a-f0-9]/','',$ipHash).'.json'; $hits=[];
  if(is_file($f)){ $j=json_decode((string)@file_get_contents($f),true); if(is_array($j)) $hits=$j; }
  $hits=array_values(array_filter($hits, fn($t)=>($now-(int)$t)<$windowSec));
  if(count($hits)>=$max) return true;
  $hits[]=$now; @file_put_contents($f,json_encode($hits),LOCK_EX); return false;
}
function bsl_notify(callable $sender,string $email): bool {
  try { return (bool)$sender($email); } catch (\Throwable $x) { return false; }
}
```

- [ ] **Step 4: Run to verify pass** — `BSL_SKIP_RENDER=1 php tests/run.php` → PASS. `php -l public_html/inc/subscribe-lib.php`.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(subscribe): pure, unit-tested email-capture logic (fail-soft)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: The `subscribe.php` HTTP endpoint

**Files:**
- Create: `public_html/subscribe.php`, `tests/render/pages-test.php` (start it here; later tasks append page assertions)

**Interfaces:**
- Consumes: `inc/config.php`, `inc/subscribe-lib.php`, optional `inc/secrets.php` (returns array).
- Behavior contract: POST-only (else 405); honeypot or too-fast → 200 success but not stored; invalid email → 422; over rate limit → 429; else append to `data/subscribers.csv`, fail-soft notify `CONTACT_EMAIL`, return 200 JSON (when `Accept: application/json`) or 303 redirect to `/#subscribe?subscribed=1`.

- [ ] **Step 1: Write the failing render test** — create `tests/render/pages-test.php`

```php
<?php
$BASE=getenv('BSL_BASE') ?: 'http://127.0.0.1:8080';
$J=['Accept: application/json'];
// method guard
t_eq(t_http('GET',"$BASE/subscribe",null,$J)['status'],405,'GET /subscribe -> 405');
// valid signup
$r=t_http('POST',"$BASE/subscribe",['email'=>'you@example.com','t'=>'5000'],$J);
t_eq($r['status'],200,'valid signup -> 200'); t_contains($r['body'],'"ok":true','ok true');
// invalid email
t_eq(t_http('POST',"$BASE/subscribe",['email'=>'nope','t'=>'5000'],$J)['status'],422,'invalid email -> 422');
// honeypot -> silent success, not stored
$r=t_http('POST',"$BASE/subscribe",['email'=>'bot@x.com','company'=>'ACME','t'=>'5000'],$J);
t_eq($r['status'],200,'honeypot -> 200'); 
// no-JS redirect (no Accept json)
$r=t_http('POST',"$BASE/subscribe",['email'=>'you@example.com'],['Accept: text/html'],false);
t_eq($r['status'],303,'no-JS post -> 303 redirect'); t_ok(t_header_has($r['headers'],'Location: /#subscribe'),'redirect Location set');
```

- [ ] **Step 2: Run to verify it fails** — `bash tests/run.sh` → FAIL (no `subscribe.php`).

- [ ] **Step 3: Implement** — `public_html/subscribe.php`

```php
<?php
require __DIR__.'/inc/config.php';
require __DIR__.'/inc/subscribe-lib.php';
$secrets = is_file(__DIR__.'/inc/secrets.php') ? (require __DIR__.'/inc/secrets.php') : [];
$wantsJson = isset($_SERVER['HTTP_ACCEPT']) && strpos($_SERVER['HTTP_ACCEPT'],'application/json')!==false;
function out_json($code,$ok,$msg){ http_response_code($code); header('Content-Type: application/json; charset=utf-8'); echo json_encode(['ok'=>$ok,'message'=>$msg]); exit; }
function out_redirect($ok){ http_response_code(303); header('Location: /#subscribe'.($ok?'?subscribed=1':'?error=1')); exit; }
$reply=function($code,$ok,$msg) use ($wantsJson){ $wantsJson?out_json($code,$ok,$msg):out_redirect($ok); };

if(($_SERVER['REQUEST_METHOD']??'GET')!=='POST'){ $reply(405,false,'Method not allowed.'); }
if(bsl_is_honeypot($_POST) || bsl_is_too_fast($_POST)){ $reply(200,true,'Thanks.'); }   // silent drop
$email=bsl_validate_email($_POST['email']??null);
if($email===null){ $reply(422,false,"That email doesn't look right."); }
$ipHash=bsl_ip_hash($_SERVER['REMOTE_ADDR']??'0.0.0.0',$secrets['IP_SALT']??'bsl');
$dataDir=__DIR__.'/data';
if(bsl_rate_limited($dataDir.'/rl',$ipHash)){ $reply(429,false,'Too many tries. Please wait a bit.'); }
bsl_append_subscriber($dataDir.'/subscribers.csv',$email,$ipHash);   // source of truth
bsl_notify(function($to) use ($secrets){
  $subject='New Better Search Lab subscriber'; $body='New release-updates signup: '.$to;
  if(!empty($secrets['SMTP_HOST']) && class_exists('\\PHPMailer\\PHPMailer\\PHPMailer')){
    $m=new \PHPMailer\PHPMailer\PHPMailer(true); $m->isSMTP(); $m->Host=$secrets['SMTP_HOST'];
    $m->SMTPAuth=true; $m->Username=$secrets['SMTP_USER']; $m->Password=$secrets['SMTP_PASS'];
    $m->SMTPSecure=$secrets['SMTP_SECURE']??'tls'; $m->Port=(int)($secrets['SMTP_PORT']??587);
    $m->setFrom($secrets['SMTP_FROM']??CONTACT_EMAIL,'Better Search Lab'); $m->addAddress(CONTACT_EMAIL);
    $m->Subject=$subject; $m->Body=$body; return $m->send();
  }
  return @mail(CONTACT_EMAIL,$subject,$body,'From: '.CONTACT_EMAIL);
},$email);
$reply(200,true,"You're on the list. We'll only email about releases.");
```

Note: PHPMailer is optional. If SMTP is not configured, the code falls back to `mail()`; if neither works the signup is still saved (fail-soft). Vendoring PHPMailer (drop its `src/` into `inc/lib/PHPMailer/` and `require` the three class files at the top of the sender) is a deploy-time nicety, not required for tests.

- [ ] **Step 4: Run to verify pass** — `bash tests/run.sh` → the subscribe assertions PASS. `php -l public_html/subscribe.php`.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(subscribe): POST endpoint (honeypot, rate-limit, fail-soft, no-JS)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---
### Task 4: The shared shell — nav, schema, head, header, footer

**Files:**
- Create: `public_html/inc/nav.php`, `public_html/inc/schema.php`, `public_html/inc/head.php`, `public_html/inc/header.php`, `public_html/inc/footer.php`, `tests/inproc/shell-test.php`

**Interfaces:**
- Consumes: `config.php` constants + `e()`.
- Produces: `emit_jsonld(array $items)`; `org_schema():array`; `breadcrumb_schema(string $name,string $path):array`. Every page sets `$page` = `['slug','title','description','og_image','jsonld'=>[/*list of schema arrays*/]]`, then `require inc/head.php`, its `<main>`, then `require inc/footer.php`. The shell renders `<head>`, header, footer, analytics, and the `site.js` include. JS/CSS selector contract for Task 5/6: `.nav-toggle`+`#site-nav`, `#subscribe` form with `input[name=t]` + `.hp` honeypot + `.subscribe-msg`, and copy buttons as `<button data-copy="#sel">`.

- [ ] **Step 1: Write the failing test** — `tests/inproc/shell-test.php`

```php
<?php
require_once __DIR__.'/../../public_html/inc/config.php';
$page=['slug'=>'probe','title'=>'Probe — Better Search Lab','description'=>'A probe page.','og_image'=>SITE_URL.'/assets/og/default.png','jsonld'=>[]];
ob_start(); require __DIR__.'/../../public_html/inc/head.php'; require __DIR__.'/../../public_html/inc/footer.php'; $h=ob_get_clean();
t_count($h,'<html',1,'exactly one <html>');
t_contains($h,'<title>Probe — Better Search Lab</title>','title from $page');
t_contains($h,'rel="canonical" href="https://bettersearchlab.com/probe"','canonical from slug');
t_contains($h,'<meta name="description" content="A probe page.">','description meta');
t_contains($h,'property="og:image" content="https://bettersearchlab.com/assets/og/default.png"','og image');
t_contains($h,'name="twitter:card" content="summary_large_image"','twitter card');
t_contains($h,'class="skip" href="#main"','skip link');
t_contains($h,'href="/features"','nav: features'); t_contains($h,'href="/install"','nav: install'); t_contains($h,'href="/faq"','nav: faq');
t_contains($h,DEMO_URL,'nav action: demo'); t_contains($h,GITLAB_URL,'footer: gitlab canonical');
t_contains($h,'Also on GitHub','github framed as secondary'); t_contains($h,'https://harperflow.io','made-by harperflow'); t_contains($h,'https://hesham.us','made-by hesham');
t_contains($h,'name="company"','honeypot field'); t_contains($h,'class="hp"','honeypot class'); t_contains($h,'name="t"','timing field');
t_contains($h,'data-domain="bettersearchlab.com"','cookieless analytics'); t_contains($h,'/assets/js/site.js','site.js include');
t_contains($h,(string)date('Y'),'footer year');
// Organization JSON-LD present and valid
if(preg_match('#<script type="application/ld\+json">(.+?)</script>#s',$h,$m)){ $d=t_json_ok($m[1],'org JSON-LD valid'); t_eq($d['@type']??'','Organization','org schema type'); }
else { t_ok(false,'JSON-LD present'); }
// no forbidden hype words leaked into chrome
foreach(['supercharge','unlock','seamless','leverage','effortless'] as $w){ t_absent($h,$w,"no hype word: $w"); }
```

- [ ] **Step 2: Run to verify it fails** — `BSL_SKIP_RENDER=1 php tests/run.php` → FAIL.

- [ ] **Step 3: Implement** the five includes.

`public_html/inc/nav.php`:
```php
<?php
return [
  ['label'=>'Features','href'=>'/features'],
  ['label'=>'Install','href'=>'/install'],
  ['label'=>'FAQ','href'=>'/faq'],
];
```

`public_html/inc/schema.php`:
```php
<?php
function emit_jsonld(array $items){
  foreach($items as $it){ if(!$it) continue;
    echo '<script type="application/ld+json">'.json_encode($it, JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE)."</script>\n"; }
}
function org_schema(){ return ['@context'=>'https://schema.org','@type'=>'Organization','name'=>SITE_NAME,'url'=>SITE_URL,'logo'=>SITE_URL.'/assets/img/logo.png','sameAs'=>[GITLAB_URL,GITHUB_URL]]; }
function breadcrumb_schema($name,$path){ return ['@context'=>'https://schema.org','@type'=>'BreadcrumbList','itemListElement'=>[
  ['@type'=>'ListItem','position'=>1,'name'=>'Home','item'=>SITE_URL.'/'],
  ['@type'=>'ListItem','position'=>2,'name'=>$name,'item'=>SITE_URL.$path]]]; }
```

`public_html/inc/head.php`:
```php
<?php
require_once __DIR__.'/config.php'; require_once __DIR__.'/schema.php';
$slug=$page['slug']??''; $canonical=SITE_URL.($slug===''?'/':'/'.$slug);
$title=$page['title']??SITE_NAME; $desc=$page['description']??''; $og=$page['og_image']??SITE_URL.'/assets/og/default.png';
?><!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title><?= e($title) ?></title>
<meta name="description" content="<?= e($desc) ?>">
<link rel="canonical" href="<?= e($canonical) ?>">
<meta name="robots" content="index, follow">
<meta property="og:type" content="website">
<meta property="og:site_name" content="<?= e(SITE_NAME) ?>">
<meta property="og:title" content="<?= e($title) ?>">
<meta property="og:description" content="<?= e($desc) ?>">
<meta property="og:url" content="<?= e($canonical) ?>">
<meta property="og:image" content="<?= e($og) ?>">
<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="<?= e($title) ?>">
<meta name="twitter:description" content="<?= e($desc) ?>">
<meta name="twitter:image" content="<?= e($og) ?>">
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="apple-touch-icon" href="/assets/icons/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
<link rel="preload" as="font" type="font/woff2" href="/assets/fonts/hanken-grotesk-400.woff2" crossorigin>
<link rel="preload" as="font" type="font/woff2" href="/assets/fonts/hanken-grotesk-600.woff2" crossorigin>
<link rel="stylesheet" href="/assets/css/styles.css">
<?php emit_jsonld(array_merge([org_schema()], $page['jsonld']??[])); ?>
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<?php require __DIR__.'/header.php'; ?>
```

`public_html/inc/header.php`:
```php
<?php $nav=require __DIR__.'/nav.php'; $cur=$page['slug']??''; ?>
<header class="site-head"><div class="wrap head-inner">
  <a class="brand" href="/" aria-label="Better Search Lab home"><img src="/assets/img/logo.svg" alt="Better Search Lab" width="150" height="24"></a>
  <button class="nav-toggle" aria-expanded="false" aria-controls="site-nav" aria-label="Menu"><span></span><span></span><span></span></button>
  <nav id="site-nav" class="site-nav" aria-label="Primary">
    <ul>
    <?php foreach($nav as $n): ?><li><a href="<?= e($n['href']) ?>"<?= ($cur!=='' && $n['href']==='/'.$cur)?' aria-current="page"':'' ?>><?= e($n['label']) ?></a></li><?php endforeach; ?>
    </ul>
    <div class="nav-actions">
      <a class="nav-ext" href="<?= e(DEMO_URL) ?>" target="_blank" rel="noopener">Demo</a>
      <a class="nav-ext" href="<?= e(GITLAB_URL) ?>" target="_blank" rel="noopener">GitLab</a>
    </div>
  </nav>
</div></header>
```

`public_html/inc/footer.php`:
```php
<footer class="site-foot"><div class="wrap foot-grid">
  <div><span class="eyebrow">Product</span><ul>
    <li><a href="/features">Features</a></li><li><a href="/install">Install</a></li>
    <li><a href="/faq">FAQ</a></li><li><a href="<?= e(DEMO_URL) ?>" target="_blank" rel="noopener">Live demo</a></li></ul></div>
  <div><span class="eyebrow">Source</span><ul>
    <li><a href="<?= e(GITLAB_URL) ?>" target="_blank" rel="noopener">GitLab (canonical)</a></li>
    <li><a href="<?= e(GITHUB_URL) ?>" target="_blank" rel="noopener">Also on GitHub</a></li>
    <li><a href="https://www.gnu.org/licenses/agpl-3.0.html" target="_blank" rel="noopener">License: AGPL-3.0</a></li></ul></div>
  <div><span class="eyebrow">Made by</span><ul>
    <li><a href="https://harperflow.io" target="_blank" rel="noopener">Harperflow</a></li>
    <li><a href="https://hesham.us" target="_blank" rel="noopener">Hesham</a></li>
    <li><a href="/privacy">Privacy</a></li></ul>
    <form id="subscribe" class="subscribe" action="/subscribe" method="post" novalidate>
      <label for="sub-email" class="eyebrow">Release updates</label>
      <div class="subscribe-row">
        <input id="sub-email" name="email" type="email" required autocomplete="email" placeholder="you@example.com" inputmode="email">
        <input type="text" name="company" tabindex="-1" autocomplete="off" aria-hidden="true" class="hp">
        <input type="hidden" name="t" value="">
        <button type="submit">Notify me</button>
      </div>
      <p class="subscribe-msg" role="status" aria-live="polite"></p>
    </form>
  </div>
</div>
<div class="wrap foot-legal"><p>&copy; <?= e(date('Y')) ?> Better Search Lab · AGPL-3.0-only · Self-hosted, honest, open source.</p></div>
</footer>
<?php if (ANALYTICS_PROVIDER==='plausible'): ?>
<script defer data-domain="<?= e(ANALYTICS_DOMAIN) ?>" src="<?= e(ANALYTICS_HOST) ?>/js/script.js"></script>
<?php endif; ?>
<script src="/assets/js/site.js" defer></script>
</body>
</html>
```

- [ ] **Step 4: Run to verify pass** — `BSL_SKIP_RENDER=1 php tests/run.php` → PASS. `php -l` each new include.

- [ ] **Step 5: Commit** — `git commit -m "feat(shell): shared head/header/footer/nav + JSON-LD helpers` … Opus trailer.

---

### Task 5: Stylesheet and self-hosted fonts

**Files:**
- Create: `public_html/assets/css/styles.css`, `public_html/assets/fonts/hanken-grotesk-{400,500,600,700}.woff2`, `tests/static/checks-test.php`

**Interfaces:**
- Consumes: the selector/markup contract from Task 4. Produces: the full Daylight visual system as CSS (tokens in `:root`, `@font-face`, typography scale, layout `.wrap`, components `.site-head/.site-nav/.nav-toggle/.brand`, `.hero/.metric-strip/.panel/.btn/.btn-secondary/.code/.copy/.subscribe`, `.eyebrow`, `.skip`, footer). Component class names are the contract pages in Tasks 7–12 use.

- [ ] **Step 1: Get the fonts.** Obtain Hanken Grotesk woff2 (weights 400/500/600/700) — download the static woff2 from Google Fonts or extract from the `@fontsource/hanken-grotesk` npm package's `files/*.woff2`; subset to Latin. Save as the four filenames above. (These are binary; commit them.)

- [ ] **Step 2: Write the failing test** — `tests/static/checks-test.php`

```php
<?php
$css=@file_get_contents(__DIR__.'/../../public_html/assets/css/styles.css') ?: '';
t_contains($css,'--n-50:#f6f7f9','ground token'); t_contains($css,'--ink','ink token');
t_contains($css,'--accent:#157f5c','evergreen accent token'); t_contains($css,'--radius:12px','radius token');
t_contains($css,'@font-face','self-hosted @font-face'); t_icontains($css,'Hanken Grotesk','font family');
t_icontains($css,'font-display:swap','font-display swap'); t_icontains($css,'color-scheme','light color-scheme');
t_icontains($css,'prefers-reduced-motion','reduced motion honored');
foreach(['#F4F1EA','linear-gradient','radial-gradient','conic-gradient','backdrop-filter','Space Grotesk'] as $bad){ t_absent($css,$bad,"no AI-tell in CSS: $bad"); }
// 'Inter' as a font (avoid matching words like 'interface'); check font-family usage
t_ok(!preg_match('/font-family:[^;]*\bInter\b/i',$css),'no Inter typeface');
// fonts present
foreach(['400','600'] as $w){ t_ok(is_file(__DIR__."/../../public_html/assets/fonts/hanken-grotesk-$w.woff2"),"font weight $w present"); }
```

- [ ] **Step 3: Run to verify it fails** — `BSL_SKIP_RENDER=1 php tests/run.php` → FAIL.

- [ ] **Step 4: Implement `styles.css`** per spec §7 (tokens §7.1, type §7.2, layout §7.3, components §7.4, motion §7.5, responsive §7.6). Requirements the test enforces plus: `.wrap{max-width:1120px;margin-inline:auto;padding-inline:clamp(20px,5vw,40px)}`; sections `padding-block:clamp(64px,9vw,120px)`; `.btn` solid ink, `.btn-secondary` white+hairline, focus-visible outline; `.panel` white+hairline+shadow-1; `.metric-strip` grid with `lg` dividers only ≥900px; `.code` light hairline surface with `overflow-x:auto`; `.hp{position:absolute;left:-9999px}`; hero left-aligned two-column ≥900px. Left-aligned/asymmetric — do not center everything. `@font-face` blocks for the four weights with `font-display:swap`.

- [ ] **Step 5: Run to verify pass** — `BSL_SKIP_RENDER=1 php tests/run.php` → PASS.

- [ ] **Step 6: Commit** — `feat(style): Daylight stylesheet + self-hosted Hanken Grotesk` … Opus trailer.

---

### Task 6: Client JS (mobile menu, copy buttons, subscribe enhancement)

**Files:**
- Create: `public_html/assets/js/site.js`; append JS checks to `tests/static/checks-test.php`

**Interfaces:**
- Consumes: `.nav-toggle`/`#site-nav`, `#subscribe`+`input[name=t]`+`.subscribe-msg`, `[data-copy="#sel"]` buttons (Task 4 contract; Tasks 9/8/7 add the copy buttons). No inline handlers (CSP).

- [ ] **Step 1: Write the failing test** — append to `tests/static/checks-test.php`

```php
$js=@file_get_contents(__DIR__.'/../../public_html/assets/js/site.js') ?: '';
t_contains($js,'addEventListener','attaches listeners (no inline handlers)');
t_contains($js,'nav-toggle','wires mobile nav'); t_contains($js,'data-copy','wires copy buttons');
t_contains($js,"getElementById('subscribe')",'wires subscribe form'); t_contains($js,'Date.now()','stamps elapsed ms into t');
t_contains($js,"headers:{'Accept':'application/json'}",'asks for JSON so PHP replies JSON');
// no inline event handlers anywhere in the shipped HTML/PHP (CSP forbids them)
foreach(glob(__DIR__.'/../../public_html/*.php') as $p){ $s=file_get_contents($p);
  foreach(['onclick=','onload=','onsubmit=','onerror='] as $h){ t_absent($s,$h,"no inline handler ($h) in ".basename($p)); } }
```

- [ ] **Step 2: Run to verify it fails** — `BSL_SKIP_RENDER=1 php tests/run.php` → FAIL.

- [ ] **Step 3: Implement** — `public_html/assets/js/site.js`

```js
(function(){
  'use strict';
  var toggle=document.querySelector('.nav-toggle'), nav=document.getElementById('site-nav');
  if(toggle&&nav){ toggle.addEventListener('click',function(){ var o=toggle.getAttribute('aria-expanded')==='true'; toggle.setAttribute('aria-expanded',String(!o)); nav.classList.toggle('open',!o); }); }
  document.querySelectorAll('[data-copy]').forEach(function(btn){
    btn.addEventListener('click',function(){ var el=document.querySelector(btn.getAttribute('data-copy')); if(!el||!navigator.clipboard) return;
      navigator.clipboard.writeText((el.innerText||el.textContent||'').trim()).then(function(){ var old=btn.textContent; btn.textContent='Copied'; setTimeout(function(){ btn.textContent=old; },1500); }); });
  });
  var form=document.getElementById('subscribe');
  if(form){ var start=Date.now(), t=form.querySelector('input[name=t]'), msg=form.querySelector('.subscribe-msg');
    form.addEventListener('submit',function(ev){ if(t) t.value=String(Date.now()-start); if(!window.fetch) return; ev.preventDefault();
      fetch('/subscribe',{method:'POST',body:new FormData(form),headers:{'Accept':'application/json'}})
        .then(function(r){return r.json();}).then(function(j){ if(msg) msg.textContent=j.message||''; if(j.ok) form.reset(); })
        .catch(function(){ if(msg) msg.textContent='Something went wrong. Try again.'; }); }); }
})();
```

- [ ] **Step 4: Run to verify pass** — `BSL_SKIP_RENDER=1 php tests/run.php` → PASS. If Node is available, also `node --check public_html/assets/js/site.js`.

- [ ] **Step 5: Commit** — `feat(js): mobile nav, copy buttons, progressive subscribe` … Opus trailer.

---
### Task 7: Product screenshots (copy + web-optimize)

**Files:**
- Create: `public_html/assets/img/src/{overview,opportunities,rankings,competitors,ai-visibility,integrations}.png` (sources) and web variants `…-1200.png`, `…-2400.png` (+ optional `.webp`); append checks to `tests/static/checks-test.php`

**Interfaces:** Produces the image paths pages reference: `/assets/img/<name>-1200.png` (1x) and `/assets/img/<name>-2400.png` (2x), names = the six above.

- [ ] **Step 1: Get the sources.** The six real screenshots are provided with this plan from the product repo `docs/screenshots/*.png` (2880×1800). Copy them into `public_html/assets/img/src/`. If not provided, recapture from `https://thefamoushesham-better-search-lab-demo.hf.space` (log in via "Explore the demo", visit `/overview /opportunities /rankings /competitors /ai-visibility /settings/integrations`, capture at 1440×900@2x). **Never edit the numbers in them.**

- [ ] **Step 2: Write the failing test** — append to `tests/static/checks-test.php`

```php
$imgdir=__DIR__.'/../../public_html/assets/img';
foreach(['overview','opportunities','rankings','competitors','ai-visibility','integrations'] as $n){
  t_ok(is_file("$imgdir/$n-1200.png"),"screenshot $n-1200.png exists");
  t_ok(is_file("$imgdir/$n-2400.png"),"screenshot $n-2400.png exists");
  if(is_file("$imgdir/$n-1200.png")){ $sz=@getimagesize("$imgdir/$n-1200.png"); t_ok($sz&&$sz[0]<=1400,"$n-1200 width <=1400"); }
}
```

- [ ] **Step 3: Generate the variants.** macOS: `sips -Z 1200 src/NAME.png --out NAME-1200.png` and `-Z 2400`. Or ImageMagick: `magick src/NAME.png -resize 1200x NAME-1200.png`. Optional WebP: `cwebp -q 82 NAME-1200.png -o NAME-1200.webp`. Do all six.

- [ ] **Step 4: Run to verify pass** — `BSL_SKIP_RENDER=1 php tests/run.php` → PASS.

- [ ] **Step 5: Commit** — `chore(assets): web-optimized real product screenshots` … Opus trailer.

---

### Task 8: Home page (`index.php`)

**Files:**
- Create: `public_html/index.php`; append Home checks to `tests/render/pages-test.php`

**Interfaces:** Consumes the shell (Task 4), components (Task 5), copy-button JS (Task 6, via `<button class="copy" data-copy="#install-cmd">`), and screenshots (Task 7). Full section order + prose: spec §10.1 (A–K).

- [ ] **Step 1: Write the failing test** — add a Home block to `tests/render/pages-test.php`

```php
$home=t_http('GET',"$BASE/"); $b=$home['body'];
// shared page checks (define this helper once at top of the file — see note)
page_common($b,$home['status'],'Home');
t_contains($b,'Your search visibility. Your AI visibility. Your server.','Home H1 (ship copy)');
t_contains($b,'SEARCH &amp; GEO VISIBILITY','eyebrow lockup');
t_contains($b,'Try the live demo','primary CTA 1'); t_contains($b,'Self-host in one command','primary CTA 2');
t_contains($b,DEMO_URL,'demo link'); t_contains($b,'href="/install"','install link');
t_contains($b,'$0.37','honest cost line');
t_contains($b,'curl -fsSL','how-it-works install command');
foreach(['Clicks','Impressions','Avg position','Sessions','Engagement','Conversions'] as $m){ t_contains($b,$m,"metric strip: $m"); }
foreach(['Perplexity','ChatGPT','Gemini'] as $ai){ t_contains($b,$ai,"AI engine: $ai"); }
foreach(['striking distance','cannibalization','CTR gaps'] as $o){ t_icontains($b,$o,"opportunity type: $o"); }
t_contains($b,'npx','MCP npx block'); t_contains($b,'better-search-lab-mcp.tgz','MCP release download');
t_contains($b,'href="/faq"','FAQ teaser link');
// SoftwareApplication JSON-LD present + valid + free
t_ok(preg_match_all('#<script type="application/ld\+json">(.+?)</script>#s',$b,$mm)>0,'has JSON-LD');
$foundApp=false; foreach($mm[1] as $j){ $d=json_decode($j,true); if(($d['@type']??'')==='SoftwareApplication'){ $foundApp=true; t_eq($d['offers']['price']??null,'0','free offer'); } }
t_ok($foundApp,'SoftwareApplication schema present');
```

Note: define `page_common()` + the `$BASE`/`$FORBIDDEN` setup once at the top of `tests/render/pages-test.php` (it already contains the Task 3 subscribe tests — prepend this helper block above them):

```php
<?php
$BASE=getenv('BSL_BASE') ?: 'http://127.0.0.1:8080';
$FORBIDDEN=['supercharge','unlock','unleash','revolutioniz','effortless','seamless','game-changing','game changing','cutting-edge','cutting edge','leverage','utiliz','empower','world-class','best-in-class'];
function page_common($b,$status,$name){ global $FORBIDDEN;
  t_eq($status,200,"$name: 200"); t_count($b,'<h1',1,"$name: exactly one <h1>");
  t_contains($b,'rel="canonical"',"$name: canonical"); t_contains($b,'/assets/js/site.js',"$name: site.js");
  foreach($FORBIDDEN as $w){ t_absent($b,$w,"$name: no forbidden word '$w'"); }
  // decorative emoji forbidden (the → arrow, U+2192, is allowed and NOT in these ranges)
  t_ok(!preg_match('/[\x{1F300}-\x{1FAFF}\x{2600}-\x{27BF}\x{2B00}-\x{2BFF}\x{FE0F}\x{200D}]/u',$b),"$name: no emoji");
}
```

- [ ] **Step 2: Run to verify it fails** — `bash tests/run.sh` → FAIL (no `index.php`).

- [ ] **Step 3: Implement `public_html/index.php`.** Compose sections A–K from spec §10.1 using the shell + components. The `$page` header:

```php
<?php
require __DIR__.'/inc/config.php';
$page=[
  'slug'=>'', 'title'=>'Better Search Lab — self-hosted SEO & AI-search visibility',
  'description'=>'Self-hosted SEO tool: rank tracking, keyword & competitor research, audits, backlinks, a weekly opportunity engine, and AI-visibility scans across Perplexity, ChatGPT & Gemini. Free, open source.',
  'og_image'=>SITE_URL.'/assets/og/home.png',
  'jsonld'=>[[ '@context'=>'https://schema.org','@type'=>'SoftwareApplication','name'=>SITE_NAME,
    'applicationCategory'=>'BusinessApplication','operatingSystem'=>'Docker, Linux, macOS, Windows',
    'description'=>'Self-hosted SEO and AI-search visibility tool: rank tracking, research, competitors, audits, backlinks, a weekly opportunity engine, and AI-visibility scans.',
    'offers'=>['@type'=>'Offer','price'=>'0','priceCurrency'=>'USD'],
    'license'=>'https://www.gnu.org/licenses/agpl-3.0.html','url'=>SITE_URL,'softwareHelp'=>SITE_URL.'/install' ]],
];
require __DIR__.'/inc/head.php';
?>
<main id="main">
  <!-- A. HERO (spec §10.1 A) -->
  <section class="hero wrap">
    <div class="hero-copy">
      <span class="eyebrow">SEARCH &amp; GEO VISIBILITY</span>
      <h1>Your search visibility. Your AI visibility. Your server.</h1>
      <p class="lede">Better Search Lab is a self-hosted tool for rank tracking, keyword and competitor research, site audits, and backlinks — with a weekly opportunity engine that turns it all into a short list of what to do next, and AI-visibility scans across Perplexity, ChatGPT and Gemini. Powered by DataForSEO on pay-as-you-go pricing, with an honest cost meter. AGPL-licensed. No seats, no credits, no lock-in.</p>
      <div class="cta-row">
        <a class="btn" href="<?= e(DEMO_URL) ?>" target="_blank" rel="noopener">Try the live demo</a>
        <a class="btn-secondary" href="/install">Self-host in one command</a>
      </div>
      <p class="cost-note">About <span class="tnum">$0.37</span> in DataForSEO spend to map a 150-keyword site. <a href="/install#costs">See the exact costs →</a></p>
    </div>
    <div class="hero-shot">
      <figure class="shot"><img src="/assets/img/overview-1200.png" srcset="/assets/img/overview-1200.png 1x, /assets/img/overview-2400.png 2x" width="1200" height="750" alt="Better Search Lab Overview: Search Console and Analytics headline with a do-this-next list"></figure>
    </div>
  </section>

  <!-- B. METRIC STRIP — REPLACE values with the demo's real current numbers; do not invent -->
  <section class="metric-strip wrap" aria-label="Example metrics from the live demo">
    <!-- Repeat this cell for: Clicks, Impressions, Avg position, Sessions, Engagement, Conversions -->
    <div class="metric"><span class="eyebrow">Clicks</span><span class="tnum val">12,480</span><span class="tnum up">+8.2%</span></div>
    <!-- …Impressions, Avg position, Sessions, Engagement, Conversions… -->
    <p class="strip-note"><a href="<?= e(DEMO_URL) ?>" target="_blank" rel="noopener">From the live demo →</a></p>
  </section>

  <!-- C. OPPORTUNITY ENGINE (spec §10.1 C) — H2 + copy naming: striking distance, decay, momentum,
       competitor gaps, SERP features, cannibalization, CTR gaps + opportunities screenshot + link to /features#opportunities -->
  <!-- D. FEATURE GRID (spec §10.1 D) — plain hairline blocks, label + one sentence, from spec §2 -->
  <!-- E. HOW IT WORKS (spec §10.1 E) — 3 steps; step 1 shows the install command in a copy block:
       <div class="code"><code id="install-cmd"><?= e(INSTALL_CMD) ?></code><button class="copy" data-copy="#install-cmd">Copy</button></div> -->
  <!-- F. AI VISIBILITY (spec §10.1 F) — names Perplexity, ChatGPT, Gemini + ai-visibility screenshot -->
  <!-- G. INTEGRATIONS (spec §10.1 G) — integrations diagram/screenshot + the optional-integrations sentence -->
  <!-- H. HONEST COSTS (spec §10.1 H) — the .tnum cost table (values from spec §2) + link to /install#costs -->
  <!-- I. FOR DEVELOPERS (spec §10.1 I) — GitLab primary + "Also on GitHub" + MCP npx block:
       <div class="code"><code>npx -y <?= e(GITLAB_URL) ?>/-/releases/v1.0.0/downloads/better-search-lab-mcp.tgz</code></div> -->
  <!-- J. FAQ TEASER (spec §10.1 J) — 3 Q&As + link to /faq -->
  <!-- K. FINAL CTA (spec §10.1 K) — demo + self-host buttons + "Free, open source, and yours to keep." -->
</main>
<?php require __DIR__.'/inc/footer.php'; ?>
```

Fill B–K with the exact copy in spec §10.1. Every visible number comes from spec §2 or the live demo — do not invent.

- [ ] **Step 4: Run to verify pass** — `bash tests/run.sh` → Home block PASS. `php -l public_html/index.php`.

- [ ] **Step 5: Commit** — `feat(home): landing page with hero, metric strip, opportunity engine` … Opus trailer.

---

### Task 9: Features page (`features.php`)

**Files:**
- Create: `public_html/features.php`; append Features checks to `tests/render/pages-test.php`

**Interfaces:** Consumes shell + components + screenshots. `$page['jsonld']=[breadcrumb_schema('Features','/features')]`. Capability rows + anchors + prose: spec §10.2.

- [ ] **Step 1: Write the failing test** — append to `tests/render/pages-test.php`

```php
$f=t_http('GET',"$BASE/features"); $b=$f['body']; page_common($b,$f['status'],'Features');
t_contains($b,'Everything Better Search Lab does','Features H1');
foreach(['id="opportunities"','id="rankings"','id="competitors"','id="ai-visibility"','id="mcp"'] as $a){ t_contains($b,$a,"anchor $a"); }
foreach(['Perplexity','ChatGPT','Gemini','DataForSEO'] as $n){ t_contains($b,$n,"names $n"); }
t_contains($b,'/assets/img/opportunities-1200.png','uses a real screenshot');
t_ok(strpos($b,'BreadcrumbList')!==false,'breadcrumb JSON-LD');
```

- [ ] **Step 2: Run to verify it fails** — `bash tests/run.sh` → FAIL.

- [ ] **Step 3: Implement `public_html/features.php`** with the `$page` header (title "Features — Better Search Lab", description per spec §12 table, `og_image` `/assets/og/features.png`, jsonld breadcrumb) and one capability row per area from spec §10.2, alternating screenshot side, plain hairline blocks (NOT identical icon cards), each with an `id` anchor. Use the real screenshots (`overview, opportunities, rankings, competitors, ai-visibility, integrations`). Close with the Final CTA band (reuse Home's markup).

- [ ] **Step 4: Run to verify pass** — `bash tests/run.sh` → Features PASS. `php -l`.

- [ ] **Step 5: Commit** — `feat(features): capability deep-dive with real screenshots` … Opus trailer.

---
### Task 10: Install page (`install.php`)

**Files:**
- Create: `public_html/install.php`; append Install checks to `tests/render/pages-test.php`

**Interfaces:** Consumes shell + `.code`/`.copy` components. `$page['jsonld']=[breadcrumb_schema('Install','/install')]`. Content: spec §10.3, with the `#costs` anchor and cost numbers from spec §2.

- [ ] **Step 1: Write the failing test** — append to `tests/render/pages-test.php`

```php
$i=t_http('GET',"$BASE/install"); $b=$i['body']; page_common($b,$i['status'],'Install');
t_contains($b,'Run Better Search Lab','Install H1');
t_contains($b,'curl -fsSL https://gitlab.com/betterbrainlab/better-search-lab/-/raw/main/install.sh | sh','one-command install');
t_contains($b,'-s -- --demo','demo variant');
t_contains($b,'docker compose up -d --build','from source');
t_contains($b,'railway.json','railway option'); t_contains($b,'Node 22','bare metal');
t_contains($b,'DATABASE_URL','required env'); t_contains($b,'AUTH_SECRET','required env');
t_contains($b,'id="costs"','costs anchor');
foreach(['$0.002','$0.012','$0.06','$0.37','$0.34'] as $c){ t_contains($b,$c,"cost figure $c"); }
t_contains($b,'data-copy','copy buttons present');
t_ok(strpos($b,'BreadcrumbList')!==false,'breadcrumb JSON-LD');
```

- [ ] **Step 2: Run to verify it fails** — `bash tests/run.sh` → FAIL.

- [ ] **Step 3: Implement `public_html/install.php`** with the `$page` header (title "Install & self-host — Better Search Lab", description per spec §12, `og_image` `/assets/og/install.png`, breadcrumb jsonld) and the sections from spec §10.3. Every command in a copy block, e.g.:

```php
<div class="code"><code id="cmd-install"><?= e(INSTALL_CMD) ?></code><button class="copy" data-copy="#cmd-install">Copy</button></div>
<div class="code"><code id="cmd-demo"><?= e(INSTALL_CMD_DEMO) ?></code><button class="copy" data-copy="#cmd-demo">Copy</button></div>
```

Include: from-source (`git clone …`, `cp .env.example .env`, set `AUTH_SECRET`, `docker compose up -d --build`), Railway (`railway.json` + `railway.worker.json`), bare metal (`Node 22, pnpm, Postgres 16; pnpm install && pnpm db:migrate && pnpm build && pnpm start`, plus `pnpm worker`), required config (`DATABASE_URL`, `AUTH_SECRET`), updating (`docker compose pull && docker compose up -d`), and a `<section id="costs">` with the `.tnum` cost table (values from spec §2). Close with the Final CTA band.

- [ ] **Step 4: Run to verify pass** — `bash tests/run.sh` → Install PASS. `php -l`.

- [ ] **Step 5: Commit** — `feat(install): self-host guide + honest costs with copy buttons` … Opus trailer.

---

### Task 11: FAQ page + FAQPage schema (`faq.php`)

**Files:**
- Create: `public_html/faq.php`; append FAQ checks to `tests/render/pages-test.php`

**Interfaces:** The 13 Q&A live in one PHP array; the page renders them AND builds the `FAQPage` schema from the same array, so answer text always matches the visible copy. `$page['jsonld']=[breadcrumb_schema('FAQ','/faq'), <FAQPage built from $faqs>]`. Answers verbatim from spec §10.4.

- [ ] **Step 1: Write the failing test** — append to `tests/render/pages-test.php`

```php
$fa=t_http('GET',"$BASE/faq"); $b=$fa['body']; page_common($b,$fa['status'],'FAQ');
$qs=['What is Better Search Lab?','Is it really free?','What does it cost to run?',
 'How is this different from Ahrefs, Semrush, or SE Ranking?',"What do you mean by 'AI visibility' or GEO?",
 'What do I need to install it?','Where does my data live?','Can I try it without installing anything?',
 'Which integrations are supported?','Does it work with my coding agent?',
 'Can I deploy it to a server or Railway?','How do I get updates?','Who makes it?'];
foreach($qs as $q){ t_contains($b,e($q),"FAQ question: $q"); }
$faqCount=0; if(preg_match_all('#<script type="application/ld\+json">(.+?)</script>#s',$b,$mm)){
  foreach($mm[1] as $j){ $d=json_decode($j,true); if(($d['@type']??'')==='FAQPage') $faqCount=count($d['mainEntity']??[]); } }
t_eq($faqCount,13,'FAQPage schema has 13 questions');
```

- [ ] **Step 2: Run to verify it fails** — `bash tests/run.sh` → FAIL.

- [ ] **Step 3: Implement `public_html/faq.php`**

```php
<?php
require __DIR__.'/inc/config.php';
$faqs=[
  ['q'=>'What is Better Search Lab?','a'=>'Better Search Lab is a free, self-hosted SEO and AI-search visibility tool. It does rank tracking, keyword and competitor research, site audits, and backlinks, and it runs a weekly opportunity engine that turns your data into a prioritized to-do list. You run it on your own machine or server.'],
  ['q'=>'Is it really free?','a'=>'Yes. Better Search Lab is open source under the AGPL-3.0 license. There are no seats, tiers, or credits. You pay only DataForSEO for the search data it fetches, on pay-as-you-go pricing, and the app shows exactly what you spend.'],
  ['q'=>'What does it cost to run?','a'=>'You pay DataForSEO directly. A rank check is about $0.002 per keyword, keyword and competitor research about $0.012 per call, and a backlinks refresh about $0.06. Mapping a 150-keyword site the first time costs about $0.37; a weekly refresh about $0.34.'],
  ['q'=>'How is this different from Ahrefs, Semrush, or SE Ranking?','a'=>'Those are hosted subscriptions billed per seat per month. Better Search Lab is software you run yourself: your data stays on your server, you pay only the underlying data cost, and you can read and modify the source. It also measures AI-answer visibility, which most classic tools don\'t.'],
  ['q'=>'What do you mean by \'AI visibility\' or GEO?','a'=>'GEO is generative-engine optimization — being visible in AI answers. Better Search Lab scans Perplexity, ChatGPT and Gemini each week to check whether your site is named or cited for the queries you care about, and shows who\'s cited when you aren\'t.'],
  ['q'=>'What do I need to install it?','a'=>'Docker and curl. One command sets up Postgres, the app, and a background worker and prints the address. First run walks you through creating an admin account and connecting DataForSEO.'],
  ['q'=>'Where does my data live?','a'=>'On your own machine or server, in your own Postgres database. Better Search Lab is self-hosted; nothing is sent to us. The only outbound calls are to the data providers you connect (DataForSEO and any optional integrations).'],
  ['q'=>'Can I try it without installing anything?','a'=>'Yes. There\'s a hosted, read-only demo with synthetic sites and ninety days of history, and a one-line demo install if you\'d rather run it locally.'],
  ['q'=>'Which integrations are supported?','a'=>'DataForSEO is the only requirement. Optional: an AI assistant of your choice, Google Search Console and Analytics, Eden AI (for AI-visibility scans), email via Resend or SMTP, the Reddit API, and Apify. All are configured in the app.'],
  ['q'=>'Does it work with my coding agent?','a'=>'Yes. It ships a Model Context Protocol (MCP) server that exposes read-only tools over your data. Run it with a single npx command from the release download and register it with Claude Code or any MCP client.'],
  ['q'=>'Can I deploy it to a server or Railway?','a'=>'Yes. Use the one-command Docker install on a VPS, the included Railway configs, or a bare-metal setup with Node 22, pnpm, and Postgres 16.'],
  ['q'=>'How do I get updates?','a'=>'Pull the latest images and restart, or opt in to hands-off updates with Watchtower. The app also notices when a newer release is available.'],
  ['q'=>'Who makes it?','a'=>'Better Search Lab is built by Harperflow and Hesham and developed in the open on GitLab, with a read-only mirror on GitHub.'],
];
$page=[
  'slug'=>'faq','title'=>'FAQ — Better Search Lab',
  'description'=>'Answers on cost, self-hosting, AI visibility, integrations, the MCP server, and how it compares to hosted SEO subscriptions.',
  'og_image'=>SITE_URL.'/assets/og/faq.png',
  'jsonld'=>[ breadcrumb_schema('FAQ','/faq'),
    ['@context'=>'https://schema.org','@type'=>'FAQPage','mainEntity'=>array_map(fn($x)=>[
      '@type'=>'Question','name'=>$x['q'],'acceptedAnswer'=>['@type'=>'Answer','text'=>$x['a']]], $faqs)] ],
];
require __DIR__.'/inc/head.php';
?>
<main id="main" class="wrap faq">
  <span class="eyebrow">FAQ</span>
  <h1>Questions, answered honestly.</h1>
  <?php foreach($faqs as $x): ?>
    <section class="qa"><h2><?= e($x['q']) ?></h2><p><?= e($x['a']) ?></p></section>
  <?php endforeach; ?>
  <p class="faq-more">Still have a question? Open an issue on <a href="<?= e(GITLAB_URL) ?>/-/issues" target="_blank" rel="noopener">GitLab</a> or email <a href="mailto:<?= e(CONTACT_EMAIL) ?>"><?= e(CONTACT_EMAIL) ?></a>.</p>
</main>
<?php require __DIR__.'/inc/footer.php'; ?>
```

Paste the 13 answers verbatim from spec §10.4 into `$faqs`. (Answers are plain sentences; if an answer needs an inline link keep it minimal — the schema `text` will include the tags, which is acceptable, but plain text is cleaner.)

- [ ] **Step 4: Run to verify pass** — `bash tests/run.sh` → FAQ PASS. `php -l`.

- [ ] **Step 5: Commit** — `feat(faq): 13 Q&A with FAQPage schema for answer engines` … Opus trailer.

---

### Task 12: Privacy page + custom 404 (`privacy.php`, `404.php`)

**Files:**
- Create: `public_html/privacy.php`, `public_html/404.php`; append checks to `tests/render/pages-test.php`

**Interfaces:** `privacy.php` `$page['jsonld']=[breadcrumb_schema('Privacy','/privacy')]`; content spec §10.5. `404.php` starts with `http_response_code(404)`; content spec §10.6.

- [ ] **Step 1: Write the failing test** — append to `tests/render/pages-test.php`

```php
$p=t_http('GET',"$BASE/privacy"); $b=$p['body']; page_common($b,$p['status'],'Privacy');
t_icontains($b,'cookieless','privacy: cookieless analytics stated');
t_icontains($b,'self-hosted','privacy: app is self-hosted');
t_contains($b,'hello@bettersearchlab.com','privacy: contact email');
t_ok(strpos($b,'BreadcrumbList')!==false,'privacy breadcrumb');
// custom 404 with real 404 status
$nf=t_http('GET',"$BASE/no-such-page-xyz"); 
t_eq($nf['status'],404,'unknown path -> 404 status');
t_icontains($nf['body'],'Go home','404 links home'); t_contains($nf['body'],DEMO_URL,'404 links demo');
```

- [ ] **Step 2: Run to verify it fails** — `bash tests/run.sh` → FAIL.

- [ ] **Step 3: Implement** both files.

`public_html/404.php`:
```php
<?php http_response_code(404); require __DIR__.'/inc/config.php';
$page=['slug'=>'404','title'=>'Page not found — Better Search Lab','description'=>'That page moved or never existed.','og_image'=>SITE_URL.'/assets/og/default.png','jsonld'=>[]];
require __DIR__.'/inc/head.php'; ?>
<main id="main" class="wrap notfound">
  <h1>That page moved or never existed.</h1>
  <p>Let's get you back on track.</p>
  <p class="cta-row"><a class="btn" href="/">Go home</a> <a class="btn-secondary" href="<?= e(DEMO_URL) ?>" target="_blank" rel="noopener">Try the live demo</a></p>
</main>
<?php require __DIR__.'/inc/footer.php'; ?>
```

`public_html/privacy.php`: `$page` header (title "Privacy — Better Search Lab", description per spec §12, breadcrumb jsonld) + the sections from spec §10.5 (what this covers; email; cookieless analytics + why no banner; what we don't do; contact `hello@bettersearchlab.com`; last-updated date). Plain prose, one `<h1>`.

- [ ] **Step 4: Run to verify pass** — `bash tests/run.sh` → Privacy + 404 PASS. `php -l` both.

- [ ] **Step 5: Commit** — `feat(pages): privacy statement + custom 404` … Opus trailer.

---
### Task 13: SEO/GEO surface files (robots, sitemap, llms, manifest)

**Files:**
- Create: `public_html/robots.txt`, `public_html/sitemap.xml`, `public_html/llms.txt`, `public_html/site.webmanifest`; append checks to `tests/static/checks-test.php`

**Interfaces:** static files served as-is. Content: spec §12 (sitemap), §13 (robots + llms).

- [ ] **Step 1: Write the failing test** — append to `tests/static/checks-test.php`

```php
$pub=__DIR__.'/../../public_html';
$robots=@file_get_contents("$pub/robots.txt")?:'';
foreach(['GPTBot','ClaudeBot','PerplexityBot','Google-Extended','OAI-SearchBot'] as $ua){ t_contains($robots,$ua,"robots welcomes $ua"); }
t_contains($robots,'Sitemap: https://bettersearchlab.com/sitemap.xml','robots names sitemap');
$sm=@file_get_contents("$pub/sitemap.xml")?:''; t_ok(simplexml_load_string($sm)!==false,'sitemap is valid XML');
foreach(['https://bettersearchlab.com/','/features','/install','/faq','/privacy'] as $u){ t_contains($sm,$u,"sitemap lists $u"); }
$llms=@file_get_contents("$pub/llms.txt")?:'';
t_contains($llms,'Better Search Lab','llms names product'); t_contains($llms,'AGPL-3.0','llms license');
t_contains($llms,DEMO_URL,'llms demo link'); t_contains($llms,GITLAB_URL,'llms gitlab link');
t_contains($llms,'Perplexity','llms AI engines');
$mani=@file_get_contents("$pub/site.webmanifest")?:''; t_ok(json_decode($mani)!==null,'manifest is valid JSON');
```

- [ ] **Step 2: Run to verify it fails** — `BSL_SKIP_RENDER=1 php tests/run.php` → FAIL.

- [ ] **Step 3: Implement the files.**

`public_html/robots.txt` — exactly the block in spec §13 (User-agent: * Allow: / ; the named AI crawlers each Allow: / ; then `Sitemap: https://bettersearchlab.com/sitemap.xml`).

`public_html/sitemap.xml`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://bettersearchlab.com/</loc><lastmod>2026-09-12</lastmod><priority>1.0</priority></url>
  <url><loc>https://bettersearchlab.com/features</loc><lastmod>2026-09-12</lastmod><priority>0.8</priority></url>
  <url><loc>https://bettersearchlab.com/install</loc><lastmod>2026-09-12</lastmod><priority>0.8</priority></url>
  <url><loc>https://bettersearchlab.com/faq</loc><lastmod>2026-09-12</lastmod><priority>0.6</priority></url>
  <url><loc>https://bettersearchlab.com/privacy</loc><lastmod>2026-09-12</lastmod><priority>0.3</priority></url>
</urlset>
```

`public_html/llms.txt` — exactly the content in spec §13 (title, `>` summary, Key facts, Links).

`public_html/site.webmanifest`:
```json
{ "name":"Better Search Lab","short_name":"Better Search Lab","start_url":"/","display":"standalone",
  "background_color":"#f6f7f9","theme_color":"#f6f7f9",
  "icons":[{"src":"/assets/icons/icon-192.png","sizes":"192x192","type":"image/png"},
           {"src":"/assets/icons/icon-512.png","sizes":"512x512","type":"image/png"}] }
```

- [ ] **Step 4: Run to verify pass** — `BSL_SKIP_RENDER=1 php tests/run.php` → PASS.

- [ ] **Step 5: Commit** — `feat(seo): robots (AI-crawler-friendly), sitemap, llms.txt, manifest` … Opus trailer.

---

### Task 14: `.htaccess` (routing, redirects, headers, caching)

**Files:**
- Create: `public_html/.htaccess`; append checks to `tests/static/checks-test.php`

**Interfaces:** Apache/LiteSpeed config. Requirements: spec §16. (Full runtime behavior verifies on Hostinger; the test greps for required directives.)

- [ ] **Step 1: Write the failing test** — append to `tests/static/checks-test.php`

```php
$ht=@file_get_contents(__DIR__.'/../../public_html/.htaccess')?:'';
t_contains($ht,'RewriteEngine On','rewrite on');
t_contains($ht,'https://bettersearchlab.com','canonical redirect target');
t_icontains($ht,'HTTP_HOST} ^www','www -> apex redirect');
t_contains($ht,'ErrorDocument 404 /404.php','custom 404');
t_contains($ht,'^/inc/','denies /inc'); t_contains($ht,'^/data/','denies /data');
t_contains($ht,'Content-Security-Policy','CSP set'); t_absent($ht,"'unsafe-inline'",'CSP has no unsafe-inline');
t_contains($ht,ANALYTICS_HOST,'CSP allows analytics host'); t_contains($ht,'Strict-Transport-Security','HSTS');
t_contains($ht,'X-Content-Type-Options','nosniff header');
t_ok(strpos($ht,'ExpiresByType')!==false || strpos($ht,'Cache-Control')!==false,'caching configured');
```

- [ ] **Step 2: Run to verify it fails** — `BSL_SKIP_RENDER=1 php tests/run.php` → FAIL.

- [ ] **Step 3: Implement `public_html/.htaccess`** per spec §16:

```apache
Options -Indexes -MultiViews
DirectoryIndex index.php
ErrorDocument 404 /404.php

<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteBase /
  RewriteCond %{HTTPS} !=on [OR]
  RewriteCond %{HTTP:X-Forwarded-Proto} !https
  RewriteRule ^ https://bettersearchlab.com%{REQUEST_URI} [R=301,L]
  RewriteCond %{HTTP_HOST} ^www\.(.+)$ [NC]
  RewriteRule ^ https://bettersearchlab.com%{REQUEST_URI} [R=301,L]
  RewriteCond %{THE_REQUEST} \s/+([^.\s]+)\.php[\s?] [NC]
  RewriteRule ^ /%1 [R=301,L]
  RewriteCond %{REQUEST_FILENAME} !-d
  RewriteRule ^(.+)/$ /$1 [R=301,L]
  RewriteCond %{REQUEST_FILENAME} !-f
  RewriteCond %{REQUEST_FILENAME} !-d
  RewriteCond %{DOCUMENT_ROOT}/$1.php -f
  RewriteRule ^([^.]+)$ /$1.php [L]
</IfModule>

RedirectMatch 404 ^/inc/
RedirectMatch 404 ^/data/
<FilesMatch "(^\.|\.(csv|log|md)$|^secrets\.php$)">
  Require all denied
</FilesMatch>

<IfModule mod_headers.c>
  Header set X-Content-Type-Options "nosniff"
  Header set Referrer-Policy "strict-origin-when-cross-origin"
  Header set X-Frame-Options "DENY"
  Header always set Strict-Transport-Security "max-age=31536000; includeSubDomains" env=HTTPS
  Header set Permissions-Policy "geolocation=(), microphone=(), camera=(), interest-cohort=()"
  Header set Content-Security-Policy "default-src 'self'; script-src 'self' https://plausible.io; connect-src 'self' https://plausible.io; img-src 'self' data:; style-src 'self'; font-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'"
</IfModule>

<IfModule mod_deflate.c>
  AddOutputFilterByType DEFLATE text/html text/css application/javascript image/svg+xml application/json
</IfModule>
<IfModule mod_expires.c>
  ExpiresActive On
  ExpiresByType text/css "access plus 1 year"
  ExpiresByType application/javascript "access plus 1 year"
  ExpiresByType font/woff2 "access plus 1 year"
  ExpiresByType image/png "access plus 6 months"
  ExpiresByType image/webp "access plus 6 months"
  ExpiresByType image/svg+xml "access plus 6 months"
  ExpiresByType text/html "access plus 0 seconds"
</IfModule>
```

(If the chosen analytics host is not `plausible.io`, update the two CSP hosts to match `ANALYTICS_HOST`.)

- [ ] **Step 4: Run to verify pass** — `BSL_SKIP_RENDER=1 php tests/run.php` → PASS.

- [ ] **Step 5: Commit** — `feat(ops): .htaccess routing, canonical redirects, CSP, caching` … Opus trailer.

---

### Task 15: Generate original brand assets

**Files:**
- Create: `public_html/assets/img/logo.svg`, `public_html/assets/img/logo.png`, `public_html/favicon.ico`, `public_html/assets/icons/{apple-touch-icon,icon-192,icon-512}.png`, `public_html/assets/og/{default,home,features,install,faq}.png`; optional `public_html/assets/img/{how-it-works,integrations}.svg`; append checks to `tests/static/checks-test.php`

**Interfaces:** Generated art obeys spec §11.1 constraints — Daylight palette, flat/geometric, **no gradients, no glassmorphism/3D, no emoji, SVG where possible**; evergreen only as a data/whisper accent.

- [ ] **Step 1: Write the failing test** — append to `tests/static/checks-test.php`

```php
$pub=__DIR__.'/../../public_html';
foreach(['/assets/img/logo.svg','/assets/img/logo.png','/favicon.ico',
  '/assets/icons/apple-touch-icon.png','/assets/icons/icon-192.png','/assets/icons/icon-512.png',
  '/assets/og/default.png','/assets/og/home.png','/assets/og/features.png','/assets/og/install.png','/assets/og/faq.png'] as $rel){
  t_ok(is_file($pub.$rel),"asset exists: $rel"); }
foreach(['default','home','features','install','faq'] as $o){ $s=@getimagesize("$pub/assets/og/$o.png"); t_ok($s&&$s[0]===1200&&$s[1]===630,"og $o is 1200x630"); }
$i192=@getimagesize("$pub/assets/icons/icon-192.png"); t_ok($i192&&$i192[0]===192,'icon-192 is 192px');
$i512=@getimagesize("$pub/assets/icons/icon-512.png"); t_ok($i512&&$i512[0]===512,'icon-512 is 512px');
$svg=@file_get_contents("$pub/assets/img/logo.svg")?:''; t_contains($svg,'<svg','logo.svg is SVG'); t_absent($svg,'Gradient','logo: no gradient');
```

- [ ] **Step 2: Run to verify it fails** — `BSL_SKIP_RENDER=1 php tests/run.php` → FAIL.

- [ ] **Step 3: Generate the assets** per spec §11.1:
  - **Logo mark + wordmark** (`logo.svg`, and a 512-tall `logo.png` for `og:logo`/schema): geometric "signal rising / visibility" glyph (ascending quantized bars, tallest doubling as a position marker), ink `#161a20` with a single evergreen `#157f5c` accent edge; "Better Search Lab" in Hanken Grotesk 600. No magnifying glass / target / rocket / brain / globe / gradient orb.
  - **Favicons** from the mark: `favicon.ico` (32+16), `apple-touch-icon.png` (180), `icon-192.png`, `icon-512.png`.
  - **OG images** (1200×630) `default/home/features/install/faq`: `#f6f7f9` ground, ink wordmark, the `SEARCH & GEO VISIBILITY` eyebrow, the page H1, a sliver of the Overview screenshot. No gradients, no stock imagery, no emoji.
  - **Optional diagrams** (`how-it-works.svg`, `integrations.svg`) per spec §11.1 #4 — flat, hairline, palette-consistent. If produced, they must contain no `Gradient`.

- [ ] **Step 4: Run to verify pass** — `BSL_SKIP_RENDER=1 php tests/run.php` → PASS. Then re-run `bash tests/run.sh` (full suite) — pages now have their real favicons/OG images.

- [ ] **Step 5: Commit** — `feat(brand): original logo, favicons, OG images, diagrams` … Opus trailer.

---

### Task 16: Capstone — full verification + deploy README

**Files:**
- Create: `tests/static/final-test.php`; Modify: `README.md`

**Interfaces:** No new site behavior. Automates the lint + no-secrets gates and completes the deploy doc.

- [ ] **Step 1: Write the failing test** — `tests/static/final-test.php`

```php
<?php
$pub=realpath(__DIR__.'/../../public_html');
// php -l every PHP file
$phps=array_merge(glob("$pub/*.php"), glob("$pub/inc/*.php"));
foreach($phps as $f){ $o=[]; $rc=0; exec('php -l '.escapeshellarg($f).' 2>&1',$o,$rc); t_eq($rc,0,'php -l '.basename($f)); }
// no secrets / data tracked in git
$root=dirname($pub); $tracked=[]; exec('git -C '.escapeshellarg($root).' ls-files 2>/dev/null',$tracked);
t_ok(!in_array('public_html/inc/secrets.php',$tracked,true),'secrets.php is NOT tracked');
foreach($tracked as $t){ t_ok(strpos($t,'public_html/data/')!==0,"data not tracked: $t"); }
// gitignore covers them
$gi=@file_get_contents("$root/.gitignore")?:''; t_contains($gi,'inc/secrets.php','gitignore secrets'); t_contains($gi,'public_html/data/','gitignore data');
```

- [ ] **Step 2: Run to verify it fails/passes** — `bash tests/run.sh`. Fix anything red.

- [ ] **Step 3: Complete `README.md`** with the Hostinger deploy steps from spec §17: domain + SSL (force HTTPS), create the `hello@bettersearchlab.com` mailbox, upload `public_html/` contents to the Hostinger web root, copy `inc/secrets.sample.php`→`inc/secrets.php` and fill SMTP, make `data/` writable, then the verification list (all pages over HTTPS; apex/www/http redirects; submit the form incl. fail-soft; Lighthouse; Rich Results Test for JSON-LD; robots/sitemap/llms resolve; no CSP console errors; submit sitemap to Google Search Console + Bing).

- [ ] **Step 4: Final gate** — run `bash tests/run.sh`: **all green**. Manually spot-check spec §18 "Definition of done" items that can't be unit-tested (Lighthouse ~100 on the deployed site, Rich Results validation, visual pass against the AI-tell blocklist §8).

- [ ] **Step 5: Commit** — `test(ci): lint + no-secrets gate; docs: Hostinger deploy guide` … Opus trailer.

---

## Notes for the executor

- **Order matters only where interfaces chain:** Tasks 1→6 build the foundation; pages (7–12) depend on the shell/styles/js; SEO files (13) and `.htaccess` (14) are independent; brand assets (15) can be generated any time after Task 4 but the full suite only goes fully green once they exist. Task 16 is last.
- **Run `bash tests/run.sh` from Task 3 onward** (it boots the dev server for render tests); Tasks 1–2 and the file-only tasks can use `BSL_SKIP_RENDER=1 php tests/run.php`.
- **Copy always comes from the spec.** When a task says "per spec §10.x", open the spec and paste the exact prose — do not paraphrase, and never invent a number, testimonial, or metric.
- **The Daylight look and the AI-tell blocklist (spec §7–§8) are acceptance criteria, not suggestions.** The automated tests catch the word-level and structural tells; a human/reviewer pass catches the visual ones.
