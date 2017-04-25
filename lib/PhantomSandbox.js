"use strict"

const { ERR_PHANTOM_TASK } = require("./errors")
const { path:PHANTOM_BIN_PATH } = require("phantomjs2")

const { class:klass } = require("ippankiban/lib/class")
//const { AvailablePort:{ getAvailablePort } } = require("./AvailablePort")
const { resolve:resolvePath } = require("path")
const { nextTick } = process
const { spawn, execSync } = require("child_process")
const { typeOf } = require("ippankiban/lib/type")
const { Serializer: { serialize, objectify, stringify } } = require("ippankiban/lib/Serializer")
const { createReadStream, unlink } = require("fs")


const { Node } = require("ippankiban/lib/Node")
const { PhantomTask, MessageEvt, ErrorEvt, RejectEvt, ResolveEvt, StartEvt, _taskWM:tasks } = require("./PhantomTask")
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

      // , getAvailablePort: { enumerable: true,
      //       value: getAvailablePort
      //   }
    })

    const readAndDelete = file => new Promise((resolve, reject) => {
        const stream = createReadStream(file)
        const chunks = []

        const onerror = e => {
            stream.removeListener("error", onerror)
            stream.removeListener("data", ondata)
            stream.removeListener("end", onend)
            reject(e)
        }

        const onend = e => {
            stream.removeListener("error", onerror)
            stream.removeListener("data", ondata)
            stream.removeListener("end", onend)
            resolve(Buffer.from(chunks.join("")))
        }

        const ondata = chunk => chunks.push(chunk)

        stream.addListener("error", onerror)
        stream.addListener("data", ondata)
        stream.addListener("end", onend)
    })
    .then(buffer => new Promise((resolve, reject) => nextTick(() => unlink(file, err => {
        if ( err )
          reject(err)
        else
          resolve( JSON.parse(buffer.toString()) )
    }))))

    return {
        constructor: function({ port, min, max, data = {}, debug = true, verbose = false }={}){
            Node.call(this)

            sandboxes.set(this, new Map)
            sandboxes.get(this).set("taskMap", new Map)
            sandboxes.get(this).set("debug", eval(debug))
            sandboxes.get(this).set("verbose", eval(verbose))
            sandboxes.get(this).set("ready", Promise.resolve()
              .then(() => new Promise(resolve => nextTick(() => {
                  ReadyStateFul.readystateChange(this, module.exports.PhantomSandbox.INITIALIZING)
                  resolve()
              })))
              //.then(() => getAvailablePort({ min: (port || min), max }))
              //.then((port ) => sandboxes.get(this).set("port", port))
              .then(() => new Promise(resolve => {
                  sandboxes.get(this).set("server", new Server)
                  sandboxes.get(this).set("ws_upgrade", new WebSocketUpgrade(this.server))

                  const onlistening = e => {
                      this.server.removeListener("listening", onlistening)

                      sandboxes.get(this).set("port", this.server.address().port)
                      if ( this.verbose )
                        console.log(`[${__filename}, pid:${process.pid}] opened temp server on port ${this.port}`)
                      resolve()
                  }

                  this.server.addListener("listening", onlistening)
                  this.server.listen(0)
              }))
              .then(() => Promise.all([
                  new Promise(resolve => {
                      const onsocket = ({socket}) => {
                          this.websocketUpgrade.removeEventListener("socket", onsocket)

                          const ontextframe = e => {
                              if ( this.verbose )
                                console.log("[PhantomSandbox.js] incoming message", e.unmask())

                              const { event, target, detail } = JSON.parse(e.unmask())

                              if ( event == "ready") {
                                  const task = this.taskMap.get(target)
                                  sandboxes.get(this).set("socket", socket)
                                  resolve()
                              }
                              else if ( this.taskMap.has(target) ){
                                  const task = this.taskMap.get(target)

                                  switch ( event ) {
                                      case "error":
                                        task.dispatchEvent( new ErrorEvt(detail) )
                                        break
                                      case "reject":
                                        task.dispatchEvent( new RejectEvt(detail) )
                                        break
                                      case "resolve":
                                        const { __file } = detail

                                        if ( __file )
                                          readAndDelete(__file)
                                            .then(data => task.dispatchEvent( new ResolveEvt(data) ))
                                            .catch(e => task.dispatchEvent( new RejectEvt(e) ))
                                        else
                                          task.dispatchEvent( new ResolveEvt(detail) )

                                        break
                                      case "message":
                                        task.dispatchEvent( new MessageEvt(detail) )
                                        break
                                      case "start":
                                        task.dispatchEvent( new StartEvt(detail) )
                                        break
                                  }
                              }
                          }

                          const onclose = e => this.destroy()

                          const onexit = e => {
                            socket.removeEventListener("textframe", ontextframe)
                            socket.removeEventListener("close", onclose)
                            this.removeEventListener("exit", onexit)
                          }

                          socket.addEventListener("textframe", ontextframe)
                          socket.addEventListener("close", onclose)
                          this.addEventListener("exit", onexit)
                      }

                      this.websocketUpgrade.addEventListener("socket", onsocket)
                  })
                , new Promise(resolve => {
                        sandboxes.get(this).set("phantom", spawn(PHANTOM_BIN_PATH, [sandbox_script, this.port, !!this.verbose ? 1: 0, JSON.stringify(data)]))

                        const onprocessexit = () => execSync("kill -9 " + this.phantom.pid)
                        const onchildexit = e => {
                            process.removeListener("exit", onprocessexit)
                            this.phantom.stdout.removeListener("data", onoutdata)
                            this.phantom.stderr.removeListener("data", onerrdata)
                            this.phantom.removeListener("exit", onchildexit)
                            ReadyStateFul.readystateChange(this, module.exports.PhantomSandbox.EXITED)
                        }

                        const onoutdata = buffer => {
                            if ( this.verbose )
                              console.log("stdout", buffer.toString())
                        }

                        const onerrdata = buffer => {
                            if ( this.verbose )
                              console.log("stderr", buffer.toString())
                        }

                        this.phantom.addListener("exit", onchildexit)
                        this.phantom.stdout.addListener("data", onoutdata)
                        this.phantom.stderr.addListener("data", onerrdata)
                        process.addListener("exit", onprocessexit)

                        resolve()
                  })
              ]))
              .catch(e => this.dispatchEvent("error", e)))

            sandboxes.get(this).set("ops", sandboxes.get(this).get("ready").then(() => new Promise(resolve => {
                ReadyStateFul.readystateChange(this, module.exports.PhantomSandbox.IDLE)
                resolve()
            })))
        }
      , debug: { enumerable: true,
            get: function(){ return sandboxes.get(this).get("debug") }
        }
      , phantom: { enumerable: true,
            get: function(){ return sandboxes.get(this).get("phantom") }
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
      , verbose: { enumerable: true,
            get: function(){ return sandboxes.get(this).get("verbose") }
        }
      , taskMap: { enumerable: true,
            get: function(){ return sandboxes.get(this).get("taskMap") }
        }
      , websocketUpgrade: { enumerable: true,
            get: function(){ return sandboxes.get(this).get("ws_upgrade") }
        }

      , destroy: { enumerable: true,
            value: function(){
                return new Promise(resolve => {
                    if ( this.readyState === module.exports.PhantomSandbox.EXITED )
                        return resolve()

                    this.socket.send(JSON.stringify({
                        event: "exit"
                    }))

                    const onreadystatechange = ({readystate}) => {
                        if ( readystate !== module.exports.PhantomSandbox.EXITED )
                          return
                        this.removeEventListener("readystatechange", onreadystatechange)
                        this.taskMap.clear()

                        this.server.unref()
                        resolve()
                        this.server.close(err => {
                            if ( err && this.debug )
                              console.warn(`[${__filename}] unable to close server ${err}`)
                        })
                    }
                    this.addEventListener("readystatechange", onreadystatechange)
                })
            }
        }
      , run: { enumerable: true,
            value: function(task){
                sandboxes.get(this).set("ops", sandboxes.get(this).get("ops")
                  .then(() => new Promise(resolve => {
                      if ( !(task instanceof PhantomTask) )
                        throw new Error(ERR_PHANTOM_TASK)

                      if ( this.readystate === module.exports.PhantomSandbox.IDLE )
                        ReadyStateFul.readystateChange(this, module.exports.PhantomSandbox.BUSY)

                      this.appendChild(task)
                      this.taskMap.set(task.id, task)

                      this.socket.send(JSON.stringify({
                          event: "task"
                        , target: task.id
                        , type: task.tid
                        , detail: task.query
                      }))

                      const onerror = () => onend()
                      const onreject = ({detail}) => {
                          task.removeEventListener("error", onerror)
                          task.removeEventListener("resolve", onresolve)
                          task.removeEventListener("reject", onreject)
                          this.taskMap.delete(task)

                          nextTick(() => {
                              if ( this.readystate === module.exports.PhantomSandbox.BUSY )
                                ReadyStateFul.readystateChange(this, module.exports.PhantomSandbox.IDLE)
                          })

                          resolve(detail) //don't lock ops chain
                      }

                      const onresolve = ({detail}) => {
                          task.removeEventListener("error", onerror)
                          task.removeEventListener("resolve", onresolve)
                          task.removeEventListener("reject", onreject)
                          this.taskMap.delete(task)

                          nextTick(() => {
                              if ( this.readystate === module.exports.PhantomSandbox.BUSY )
                                ReadyStateFul.readystateChange(this, module.exports.PhantomSandbox.IDLE)
                          })

                          resolve(detail)
                      }

                      task.addEventListener("error", onerror)
                      task.addEventListener("resolve", onresolve)
                      task.addEventListener("reject", onreject)
                  })))
            }
        }
    }
})
