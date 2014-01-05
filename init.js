#!/usr/bin/env node

var spawn   = require('child_process').spawn;
var fs      = require('fs');

// try to bring loopy up, but this might be a non-linux 
// system and we don't want to spoil everyones fun
// just because src-sockios fails
try {
  var io      = require('src-sockios');
  // Bring Loopback Device Up for HTTP Process Control
  if(0 === io.loopbackUp()){
    console.log("loopback device was activated");
  }else{
    console.log('loopback device not activated');
  }
} catch (e) {
  // oops no loopback
}
var restify = require('restify');

//
var Runner  = require('./runner.js')(spawn);

// Injectable Configurations
var PORT    = process.env.PORT || 1;
var BIND    = process.env.BIND || '127.0.0.1';
var BOOT    = process.env.BOOT || 0;

console.log('----> starting init');
console.log('      bind:', BIND);
console.log('      port:', PORT);
console.log('      boot:', BOOT);

function Job(stanza) {
  this.stanza   = stanza;
  this.lastExit = null;
  this.respawn  = 0;
  this.pid      = -1;
}

// Keep an Active Job List
function Init() {
  this.jobs  = {};
  this.proc  = {};
}

// start a daemon process
Init.prototype.start = function (name, stanza){

  var init    = this;
  var jobs    = this.jobs;
  var runner  = Runner.New();

  runner.cwd  = stanza.cwd;
  runner.exec = stanza.exec;
  runner.args = stanza.args;
  runner.envs = stanza.env;
  runner.fds  = 'pipe';

  var proc    = runner.run();
  var job     = jobs[name] || new Job(stanza);

  proc.on('error', function (err) {
    console.error('----X error spawning process', err);
  });

  // restart process on failure
  // don't restart when a signal is received
  proc.on('exit', function (code, signal) {
    if (code===0 || code) console.log("    * process %d exited with code", proc.pid, code);
    if (signal) console.log("    * process %d exited from signal", proc.pid, signal);

    job.lastExit = code || signal;
    job.status   = 'success';

    // we assume processes that exit with a non-zero code failed
    // and need to be restarted. in order to avoid crazyness we
    // delay the process restart by 1 second
    // 
    // we do not restart when a signal kills the process
    if (code) setTimeout(function(){
      console.log("Respawning Job", name);
      job.status = 'failed';
      job.respawn++;
      init.start(name, stanza);
    }, 1000);

    return;
  });

  // if stdio is defined, we wire those to the process
  // stdio is always piped, rather than directly wired
  // you can define as many stdio as you like
  // missing values will be skipped
  // right now, they must be paths to files
  // if you don't have permission, bad things will happen
  var stdio, stdin, stderr, stdout;
  if (stdio = stanza.stdio) {
    if (stdin  = stdio.stdin)  fs.createReadStream(stdin).pipe(proc.stdin);
    if (stdout = stdio.stdout) proc.stdout.pipe(fs.createWriteStream(stdout));
    if (stderr = stdio.stderr) proc.stderr.pipe(fs.createWriteStream(stderr));
  }

  job.pid    = proc.pid;
  job.status = 'running';

  this.jobs[name]    = job;
  this.proc[job.pid] = proc;

  return proc;
}

var app  = restify.createServer();
var init = new Init();

app.use(restify.queryParser());
app.use(restify.bodyParser());

// create a new job, either relative or global
app.put('/job/:name', function(req,res){
  var body = req.body.toString();
  var name = req.params.name;
  
  try{
    var stanza = JSON.parse(body);
    var proc   = init.start(name, stanza);

    // stream stdio
    if (req.params.stdio == 'stream') {
      res.write('streaming stdio\n');
      // when streaming, the processes stdio is piped back
      // to the clien connection
      proc.stdout.pipe(res);
      proc.stderr.pipe(res);
      proc.on('close', function () {
        res.end();
      });
      // if the underlying connection is terminated early
      // unpipe stdio to avoid fucking up the stream
      res.on('close', function () {
        proc.stdout.unpipe(res);
        proc.stderr.unpipe(res);
      });
    }

    // don't stream stdio
    else {
      res.write('not streaming stdio\n');
      console.log('Not Streaming stdio', req.params);
      res.send(201);
    }
  }
  catch(e){
    console.error('Failed to parse body', e, body.toString());
    res.send(400, e);
  }
});

// list all the jobs
app.get('/jobs', function(req,res){
  console.log('List Job');
  res.send(Object.keys(init.jobs));
});

// get the status of a single job
app.get('/job/:id', function(req,res){
  var job;
  var jobid = req.params.id;
  console.log('Get Job',req.params.id);
  if(job=init.jobs[jobid]){
    res.send(job);
  }else{
    res.send(404);
  }
});

app.put('/job/:id/sig/:signal', function(req,res){
  var job;
  var jobid  = req.params.id;
  var signal = req.params.signal;
  console.log('    * signal Job %s with %s',req.params.id,req.params.signal);
  if (job=init.proc[init.jobs[jobid].pid]){
    job.kill(signal);
    res.send(204);
  }
  else{
    res.send(404);
  }
});

app.del('/job/:id', function(req,res){
  var name = req.params.id;
  console.log('Delete Job',name);
  delete init.jobs[name];
});

function shutdown() {
  server.close();
  process.exit(0);
}

function firstRun(err) {
  if(err) throw err;
  
  var runner  = Runner.New();

  runner.cwd  = process.cwd();
  runner.exec = process.argv[2];
  runner.args = process.argv.slice(3);
  runner.envs = process.env;
  runner.fds  = [
    process.stdin,
    process.stdout,
    process.stderr
  ];

  var proc    = runner.run();

  // in non-boot mode, we close init after the first
  // runner exists, otherwise the process just hangs
  // around waiting for attention that will never come
  proc.on('exit', function (code, signal) {
    console.log("<---- first runner exited");
    if (!BOOT) {
      console.log("<---- stopping init because BOOT=0 (set BOOT=1 to override)");
      shutdown();
    }
  });

  proc.on('error', function (err) {
    console.error(err);
  });

  console.log('----> starting first runner');
  console.log('      exec:', runner.exec);
  console.log('      args:', runner.args);
  console.log('      cwd :', runner.cwd);

  return;
}

var server = app.listen(PORT, BIND, firstRun);

// ignore SIGINT in case someone uses a shell as their
// first runner, in which case we don't want to catch
// any ^C commands and kill init by accident
// process.on('SIGINT', function () {});

