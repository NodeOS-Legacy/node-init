var assert = require('assert');
var events = require('events');

var DEFAULT_ENVS = {};
var DEFAULT_ARGS = [];
var DEFAULT_EMIT = new events.EventEmitter();

// runners execute child processes
function Runner(module){
  this._module = module;
  this.cwd     = null;
  this.exec    = null;
  this.fds     = null;
  this.args    = DEFAULT_ARGS;
  this.envs    = DEFAULT_ENVS;
  this.emitter = DEFAULT_EMIT;
}

Runner.prototype.run = function run() {
  
  assert(this.cwd  , "runner requires a cwd");
  assert(this.exec , "runner requires an exec");

  var emitter = this.emitter;
  var spawn   = this._module.spawn;

  var options = {
    env   : this.envs,
    cwd   : this.cwd,
    stdio : this.fds
  };
  
  // -- HERE IS THE BEAST -- //
  var proc = spawn(this.exec, this.args, options);

  return proc;
  
}

// module objects are for injecting dependencies
// and creating new objects
function RunnerModule(spawn) {
  this.spawn = spawn;
}

RunnerModule.prototype.New = function () {
  return new Runner(this);
}

RunnerModule.prototype.NewWithEmitter = function (emitter) {
  var runner = this.New();
  runner.emitter = emitter;
  return runner;
}

module.exports = function (spawn) {
  return new RunnerModule(spawn);
}

// tests

if (!module.parent) {

  function on(event, func) {
    console.log('on', event)
    console.log('do', func.toString())
  }

  function spawn(exec, args, opts) {
    console.log('spawn', exec);
    console.log('with', args);
    console.log('and', opts);
    return {on:on}
  }
  function emit(event, data) {
    console.log('emit', event);
    console.log('with', data);
  }
  var rm = new RunnerModule(spawn);
  var rn = rm.NewWithEmitter({emit:emit});

  rn.cwd = "."
  rn.exec = "ls"

  console.log('proc', rn.run());

}
