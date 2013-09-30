#!/usr/bin/env node

var spawn   = require('child_process').spawn;
var cat     = require('concat-stream');
var express = require('express');
var io      = require('src-sockios');

// Injectable Configurations
var PORT = process.env.PORT || 1;
var BIND = process.env.BIND || '127.0.0.1';
var BOOT = process.env.BOOT || 0;

console.log('Starting Init Process');

// Keep an Active Job List
var jobs = {};

// Bring Loopback Device Up for HTTP Process Control
var loop = io.loopbackUp();
if(loop===0){
  console.log('Activated Loopback Device');
}else{
  console.log('Failed to Activate Loopback Device');
}

// RESTful Express Application

var app  = express();

function start(man){
  var opt = {
    cwd : man.cwd,
    env : man.env,
    stdio: 'inherit'
  }
  var job = spawn(man.exec,man.args,opt);
  job.on('error',function(err){
    console.log('Error Spawning Job',err);
  });
  job.on('exit',function(code){
    console.log('Job [%s] Exited With Status %d',job.pid,code);
    setTimeout(function(){
      if(code!==0) start(man);
    },1000);
  });
  jobs[job.pid] = job;
  console.log('pid->',job.pid);
}

app.post('/job',function(req,res){
  req.pipe(cat(function(body){
    console.log('Create Job',body.toString());
    try{
      var man = JSON.parse(body);
      console.log('man->',man);
      start(man);
      res.send(204);
    }catch(e){
      console.log(e)
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

app.listen(PORT,BIND,function(err){
  
  if(err) console.log("ERROR Binding to Port");
  
  console.log('Server Listening on %s:%s',BIND,PORT);
  
  // First Runner
  // The first runner can be a short process, or a long running process.
  
  var exec = process.argv[2];
  
  if(!exec) return console.log('Not First Runner Defined');
  
  process.env.PATH = '/root/bin:' + process.env.PATH
  process.env.HOME = '/root'
  
  var opts = {
    env: process.env,
    cwd: process.cwd(),
    stdio: 'inherit'
  };
  
  var args = [];
  for(var i=3; i<process.argv.length; i++){
    args.push(process.argv[i]);
  }
  
  console.log('Spawning First Runner [%s] with Arguments [%s]',exec,args);
  
  var first = spawn(exec,args,opts);
  
  first.on('error',function(err){
    console.log('Error Finding First Runner:',err);
  });
  
  first.on('exit',function(code){
    if(code!==0){
      console.log('First Runner Exited Abnormally',code);
      
      // If the first-runner exits abnormally we want to abort
      process.exit(code);
      
    }else{
      
      // If the first-runner exists normally, we assume it did its job.
      // Often the first-running boots a bunch of daemon processes
      // then chooses to exit
      console.log('First Runner Exited Normally');
      
      // If the init daemon is supposed to boot the system, it should
      // not exit after the first-runner terminates.
      if( BOOT===0 ){
        console.log('Init in Non-Boot Mode - Process Exiting');
        process.exit(code);
      }
    }
  });
  
});

process.on('SIGINT', function(){
  // Ignore SIGIN 
});
