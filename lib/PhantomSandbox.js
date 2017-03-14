"use strict"

const { ERR_PHANTOM_TASK } = require("./errors")
const { path:PHANTOM_BIN_PATH } = require("phantomjs2")

const { class:klass } = require("ippankiban/lib/class")
const { getAvailablePort } = require("./getAvailablePort")
const { resolve:resolvePath } = require("path")
const { nextTick } = process
const { spawn, execSync } = require("child_process")
const { typeOf } = require("ippankiban/lib/type")
const { Serializer: { serialize, objectify, stringify } } = require("ippankiban/lib/Serializer")


const { Node } = require("ippankiban/lib/Node")
const { PhantomTask } = require("./PhantomTask")
const { ReadyStateFul } = require("ippankiban/lib/ReadyStateFul")
const { Server } = require("./Server")
const { WebSocketUpgrade } = require("./WebSocketUpgrade")

module.exports.PhantomSandbox = klass(Node, ReadyStateFul, statics => {
    const sandboxes = new WeakMap
    const sandbox_script = resolvePath(__dirname, "./phantom/sandbox.js")

    Object.defineProperties(statics, {
        UNINITIALIZED: { enumerable: true, value: 0b0 }
      , [0b0]: { enumerable: true, value: "UNINITIALIZED"}
      , INITIALIZING: { enumerable: true, value: 0b1 }
      , [0b1]: { enumerable: true, value: "INITIALIZING" }
      , IDLE: { enumerable: true, value: 0b10 }
      , [0b10]: { enumerable: true, value: "IDLE" }
      , BUSY: { enumerable: true, value: 0b11 }
      , [0b11]: { enumerable: true, value: "BUSY" }
      , EXITED: { enumerable: true, value: 0b100 }
      , [0b100]: { enumerable: true, value: "EXITED" }

      , getAvailablePort: { enumerable: true,
            value: getAvailablePort
        }
    })

    return {
        constructor: function({ task, port, min, max }={}){
            Node.call(this)

            sandboxes.set(this, new Map)
            sandboxes.get(this).set("ready", Promise.resolve()
              .then(() => new Promise(resolve => nextTick(() => {
                  ReadyStateFul.readystateChange(this, module.exports.PhantomSandbox.INITIALIZING)
                  resolve()
              })))
              .then(() => getAvailablePort({ min: (port || min), max }))
              .then((port ) => sandboxes.get(this).set("port", port))
              .then(() => new Promise(resolve => {
                  sandboxes.get(this).set("server", new Server)
                  sandboxes.get(this).set("ws_upgrade", new WebSocketUpgrade(this.server))

                  const onlistening = e => {
                      this.server.removeListener("listening", onlistening)
                      resolve()
                  }

                  this.server.addListener("listening", onlistening)
                  this.server.listen(this.port)
              }))
              .then(() => Promise.all([
                  new Promise(resolve => {
                      const onsocket = ({socket}) => {
                          this.websocketUpgrade.removeEventListener("socket", onsocket)

                          const ontextframe = e => {
                              const { event } = JSON.parse(e.unmask())

                              if ( event == "ready") {
                                  socket.removeEventListener("textframe", ontextframe)
                                  sandboxes.get(this).set("socket", socket)
                                  resolve()
                              }
                          }

                          socket.addEventListener("textframe", ontextframe)
                      }

                      this.websocketUpgrade.addEventListener("socket", onsocket)
                  })
                , new Promise(resolve => {
                        sandboxes.get(this).set("phantom", spawn(PHANTOM_BIN_PATH, [sandbox_script, this.port, 1]))

                        const onprocessexit = () => execSync("kill -9 " + this.phantom.pid)
                        const onchildexit = e => {
                            process.removeListener("exit", onprocessexit)
                            this.phantom.stdout.removeListener("data", onoutdata)
                            this.phantom.stderr.removeListener("data", onerrdata)
                            this.phantom.removeListener("exit", onchildexit)
                            ReadyStateFul.readystateChange(this, module.exports.PhantomSandbox.EXITED)
                        }

                        const onoutdata = buffer => {
                            console.log("stdout", buffer.toString())
                        }

                        const onerrdata = buffer => {
                            console.log("stderr", buffer.toString())
                        }

                        this.phantom.addListener("exit", onchildexit)
                        this.phantom.stdout.addListener("data", onoutdata)
                        this.phantom.stderr.addListener("data", onerrdata)
                        process.addListener("exit", onprocessexit)

                        resolve()
                  })
              ]))
              .then(() => new Promise(resolve => {
                  ReadyStateFul.readystateChange(this, module.exports.PhantomSandbox.IDLE)
                  resolve()
              }))
              .catch(e => this.dispatchEvent("error", e)))
        }
      , port: { enumerable: true,
            get: function(){ return sandboxes.get(this).get("port") }
        }
      , server: { enumerable: true,
            get: function(){ return sandboxes.get(this).get("server") }
        }
      , socket: { enumerable: true,
            get: function(){ return sandboxes.get(this).get("socket") }
        }
      , phantom: { enumerable: true,
            get: function(){ return sandboxes.get(this).get("phantom") }
        }
      , websocketUpgrade: { eumerable: true,
            get: function(){ return sandboxes.get(this).get("ws_upgrade") }
        }

      , run: { enumerable: true,
            value: function(task){
                return sandboxes.get(this).get("ready")
                  .then(() => new Promise(resolve => {
                      if ( !(task instanceof PhantomTask) )
                        throw new Error(ERR_PHANTOM_TASK)

                      this.socket.send(JSON.stringify({
                          event: "task"
                        , target: task.id
                        , type: task.tid
                        , detail: task.query
                      }))

                      //resolve()
                  }))

            }
        }
    }
})