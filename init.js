#!/usr/bin/env node

var spawn   = require('child_process').spawn;
var fs      = require('fs');
var assert  = require('assert');

//
var cat     = require('concat-stream');
var io      = require('src-sockios');
var restify = require('restify');
var bunyan  = require('bunyan');

//
var Runner  = require('./runner.js')(spawn);

// Injectable Configurations
var PORT    = process.env.PORT || 1;
var BIND    = process.env.BIND || '127.0.0.1';
var BOOT    = process.env.BOOT || 0;

var config  = require('./config.js');

var log     = bunyan.createLogger(config.bunyan);

log.info('Starting Init Process');

// Bring Loopback Device Up for HTTP Process Control
process.stdout.write('Loopback Device: ');
if(0 === io.loopbackUp()){
  log.info("Activated");
}else{
  log.info('Failed');
}

// Keep an Active Job List
function Init() {
  this.jobs  = {};
  this.proc  = {};
}

// start a daemon process
Init.prototype.start = function (name, stanza){
  log.debug('Init Stanza', stanza);

  var init    = this;
  var jobs    = this.jobs;
  var runner  = Runner.New();

  runner.cwd  = stanza.cwd;
  runner.exec = stanza.exec;
  runner.args = stanza.args;

  var proc    = runner.run();

  proc.on('error', function (err) {
    log.error('Error Spawning proc', err);
  });

  proc.on('exit', function (code, signal) {
    if (code)   log.info("Process [%d] exited with code", proc.pid, code);
    if (signal) log.info("Process [%d] exited from signal", proc.pid, signal);

    job.lastExit = code || signal;

    // we assume processes that exit with a non-zero code failed
    // and need to be restarted. in order to avoid crazyness we
    // delay the process restart by 1 second
    if (code!==0) setTimeout(function(){
      log.info("Respawning Job", name);
      job.respawn++;
      init.start(name, stanza);
    }, 1000);

    return;
  });

  var job = this.jobs[name] || {
    stanza   : stanza,
    lastExit : null,
    respawn  : 0,
    pid      : proc.pid
  };

  this.jobs[name]    = job;
  this.proc[job.pid] = proc;

  return job.pid;
}

var app  = restify.createServer();
var init = new Init();

app.put('/job/:name', function(req,res){
  req.pipe(cat(function(body){
    var name = req.params.name;
    try{
      var stanza = JSON.parse(body);
      var pid    = init.start(name, stanza);
      res.send(204, {pid: pid, name: name});
    }
    catch(e){
      log.error('Failed to parse body', e, body.toString());
      res.send(400, e);
    }
  }));
});

app.get('/jobs', function(req,res){
  log.info('List Job');
  res.send(Object.keys(init.jobs));
});

app.get('/job/:id', function(req,res){
  var job;
  var jobid = req.params.id;
  log.info('Get Job',req.params.id);
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
  log.info('Signal Job %s with %s',req.params.id,req.params.signal);
  if (job=init.proc[init.jobs[jobid].pid]){
    job.kill(signal);
    res.send(204);
  }
  else{
    res.send(404);
  }
});

app.del('/job/:id', function(req,res){
  log.info('Delete Job',req.params.id);
  delete init.jobs[req.params.id];
});

function shutdown() {
  server.close();
}

function firstRun(err) {
  if(err) throw err;
  
  var runner  = Runner.New();

  runner.cwd  = "/";
  runner.exec = process.argv[2];
  runner.args = process.argv.slice(3);
  runner.envs = process.env;

  var proc    = runner.run();

  // in non-boot mode, we close init after the first
  // runner exists, otherwise the process just hangs
  // around waiting for attention that will never come
  proc.on('exit', function (code, signal) {
    if (!BOOT) shutdown();
    if (code)   log.info("First runner exited with code", code);
    if (signal) log.info("First runner exited from signal", signal);
  });

  // pipe input to first runner in case someone
  // wants to use an interactive runner
  proc.stdout.pipe(process.stdout);
  proc.stderr.pipe(process.stderr);
  process.stdin.pipe(proc.stdin);

  return;
}

var server = app.listen(PORT, BIND, firstRun);

// ignore SIGINT in case someone uses a shell as their
// first runner, in which case we don't want to catch
// any ^C commands and kill init by accident
// process.on('SIGINT', function () {});

