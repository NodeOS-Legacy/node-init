#!/usr/bin/env node

var spawn   = require('child_process').spawn;
var fs      = require('fs');
var assert  = require('assert');

//
var cat     = require('concat-stream');
var io      = require('src-sockios');
var restify = require('restify');

//
var Runner  = require('./runner.js')(spawn);

// Injectable Configurations
var PORT    = process.env.PORT || 1;
var BIND    = process.env.BIND || '127.0.0.1';
var BOOT    = process.env.BOOT || 0;

console.log('Starting Init');

// Bring Loopback Device Up for HTTP Process Control
if(0 === io.loopbackUp()){
  console.log("Loopback Device Activated");
}else{
  console.log('Loopback Device Failed');
}

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

  var proc    = runner.run();
  var job     = jobs[name] || new Job(stanza);

  proc.on('error', function (err) {
    console.error('Error Spawning proc', err);
  });

  // restart process on failure
  // don't restart when a signal is received
  proc.on('exit', function (code, signal) {
    if (code===0 || code) console.log("Process [%d] exited with code", proc.pid, code);
    if (signal) console.log("Process [%d] exited from signal", proc.pid, signal);

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

  job.pid    = proc.pid;
  job.status = 'running';

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
      console.error('Failed to parse body', e, body.toString());
      res.send(400, e);
    }
  }));
});

app.get('/jobs', function(req,res){
  console.log('List Job');
  res.send(Object.keys(init.jobs));
});

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
  console.log('Signal Job %s with %s',req.params.id,req.params.signal);
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
    if (code!==null) console.log("First runner exited with code", code);
    if (signal) console.log("First runner exited from signal", signal);
    if (!BOOT) {
      console.log("Stopping init in non-boot mode");
      shutdown();
    }
  });

  proc.on('error', function (err) {
    console.error(err);
  });

  console.log('First Runner Started');

  return;
}

var server = app.listen(PORT, BIND, firstRun);

// ignore SIGINT in case someone uses a shell as their
// first runner, in which case we don't want to catch
// any ^C commands and kill init by accident
// process.on('SIGINT', function () {});

