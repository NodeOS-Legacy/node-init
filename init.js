#!/usr/bin/env node

var spawn   = require('child_process').spawn;
var fs      = require('fs');
var assert  = require('assert');

//
var cat     = require('concat-stream');
var express = require('express');
var io      = require('src-sockios');

//
var Runner  = require('./runner.js')(spawn);

// Injectable Configurations
var PORT = process.env.PORT || 1;
var BIND = process.env.BIND || '127.0.0.1';
var BOOT = process.env.BOOT || 0;

console.log('Starting Init Process');

// Bring Loopback Device Up for HTTP Process Control
process.stdout.write('Loopback Device: ');
if(0 === io.loopbackUp()){
  console.log("Activated");
}else{
  console.log('Failed');
}

// RESTful Express Application

// Keep an Active Job List
var jobs = {};

var app  = express();

// start a daemon process
function start(man){

  // certain properties are required or insanity prevails
  assert(man.cwd,  "job stanza requires a cwd path");
  assert(man.env,  "job stanza requires an environment object");
  assert(man.exec, "job stanza requires an exec field");
  assert(man.args, "job stanza requires an args array");

  var opt = {
    cwd   : man.cwd,
    env   : man.env,

    // for now we log to inits stdout
    // eventually this will redirecto to a log file
    stdio : 'inherit'
  }

  var job = spawn(man.exec,man.args,opt);

  job.on('error',function(err){
    console.log('Error Spawning Job',err);
  });

  job.on('exit',function(code){

    console.log('Job [%s] Exited With Status %d',job.pid,code);

    // we assume processes that exit with a non-zero code failed
    // and need to be restarted. in order to avoid crazyness we
    // delay the process restart by 1 second
    if (code!==0) setTimeout(function(){
      start(man);
    }, 1000);

  });

  // jobs are stored by PID
  jobs[job.pid] = job;

  console.log('pid->',job.pid);

}

app.post('/job',function(req,res){
  req.pipe(cat(function(body){
    console.log('Create Job',body.toString());
    try{
      var man = JSON.parse(body);
      start(man);
      res.send(204);
    }catch(e){
      res.send(400,e.toString()+'\n');
    }
  }));
});

app.get('/jobs',function(req,res){
  res.send(Object.keys(jobs));
  console.log('List Job');
});

app.get('/job/:id',function(req,res){
  var job;
  var jobid = req.params.id;
  console.log('Get Job',req.params.id);
  if(job=jobs[jobid]){
    res.send(job);
  }else{
    res.send(404);
  }
});

app.put('/job/:id/sig/:signal',function(req,res){
  var job;
  var jobid  = req.params.id;
  var signal = req.params.signal;
  console.log('Signal Job %s with %s',req.params.id,req.params.signal);
  if( job  =jobs[jobid]){
    job.kill(signal);
    res.send(204);
  }else{
    res.send(404);
  }
});

app.del('/job/:id',function(req,res){
  console.log('Delete Job',req.params.id);
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
process.on('SIGINT', function () {});

