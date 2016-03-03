# Obsolete, using [nodeos-init](https://github.com/piranna/nodeos-init) instead

This repo will remain for reference purposses

----

# NodeOS Init

The init process, typically `/sbin/init`, is a long-lived process started by the kernel during boot.
Init is responsible for starting system daemons such as `sshd`, `getty`, and `dhcp`.

On Ubuntu the init daemon is **Upstart**.
Upstart, like most init daemons, has the concept of a system runlevel numbered 0-5.
When init starts, it uses the runlevel to decide how to boot the system.
The startup sequence involves parsing files in `/etc/rcX.d`,
`/etc/init`, and `/etc/init.d`.

The NodeOS init daemon takes a different approach.
The init daemon does nothing except basic job control.

- Init starts an HTTP server on `127.0.0.1:1` that can be used to start and stop jobs.
- Init hands control to another process that uses the API to boot the system as desired.
- Init itself does not parse config files.

## API

```
GET    /jobs               <-- list all jobs
POST   /job                <-- start a job
PUT    /job/:id            <-- start a job with a specific name
PUT    /job/:id/sig/:sig   <-- signal a process
GET    /job/:id            <-- get job info
DELETE /job/:id            <-- clear a stopped job
```

Starting a job requires a JSON payload

```json
{
  "exec": "node",
  "args": [ "server.js" ],
  "cwd" : "/var/www",
  "envs": {
    "PORT": "80",
    "PATH": "/bin:/root/bin"
  },
  "user": "www",
  "group": "www"
}
```

**Todo**

- restart semantics
- handling stdio
- pre-opened file-descriptors
- authentication and access control

## Usage

```
init [next command and args]
```

After init starts its HTTP server,
it passes the task of booting the system off to another process.
You specify the next process by passing the command to init during start.
These parameters can, and should, be passed to init by grub.

The next command effectively decides what order to boot system daemons in.
The `npkg` command defined in `nodeos-npkg` provides a nice interface between init 
and NodeJS packages installed on the system.

