"use Strict"

const { ERR_PHANTOM_TASK } = require("./errors")

const { getAvailablePort } = require("./getAvailablePort")
const { class:klass } = require("ippankiban/lib/class")
const { resolve:resolvePath } = require("path")
const { path:PHANTOM_BIN_PATH } = require("phantomjs2")
const { nextTick } = process
const { Serializer: { serialize, objectify } } = require("ippankiban/lib/Serializer")
const { spawn, execSync } = require("child_process")
const { typeOf } = require("ippankiban/lib/type")
const { UID:{ uid } } = require("ippankiban/lib/UID")
const { request:httpRequest } = require("http")

const { Node } = require("ippankiban/lib/Node")
const { PhantomTask } = require("./PhantomTask")
const { ReadyStateFul } = require("ippankiban/lib/ReadyStateFul")

module.exports.PhantomBrowser = klass(Node, ReadyStateFul, statics => {
    const browsers = new WeakMap
    const phantomServerScript = resolvePath(__dirname, "./phantom/server.js")

    Object.defineProperties(statics, {
        UNINITIALIZED: { enumerable: true, value: 0b0 }
      , [0b0]: { enumerable: true, value: "UNINITIALIZED"}
      , INITIALIZING: { enumerable: true, value: 0b1 }
      , [0b1]: { enumerable: true, value: "INITIALIZING" }
      , READY: { enumerable: true, value: 0b10 }
      , [0b10]: { enumerable: true, value: "READY" }
      , EXITED: { enumerable: true, value: 0b11 }
      , [0b11]: { enumerable: true, value: "EXITED" }

      , getAvailablePort: { enumerable: true,
            value: getAvailablePort
        }
    })

    return {
        constructor: function({ port, min, max, parameters }){
            Node.call(this)

            browsers.set(this, new Map)
            browsers.get(this).set("uid", uid())
            browsers.get(this).set("parameters", typeOf(parameters) == "string" ? parameters : "")

            const ready = Promise.resolve()
              .then(() => new Promise(resolve => nextTick(() => {
                  ReadyStateFul.readystateChange(this, module.exports.PhantomBrowser.INITIALIZING)
                  resolve()
              })))
              .then(() => getAvailablePort({ min: (port || min), max }))
              .then(port => browsers.get(this).set("port", port))
              .then(() => {
                  browsers.get(this).set("child", spawn(PHANTOM_BIN_PATH, [phantomServerScript, this.port, true, this.uid, this.parameters]))

                  const onprocessexit = () => execSync("kill -9 " + this.child.pid)
                  const onchildexit = e => {
                      process.removeListener("exit", onprocessexit)
                      this.child.stdout.removeListener("data", onoutdata)
                      this.child.stderr.removeListener("data", onerrdata)
                      this.child.removeListener("exit", onchildexit)
                      ReadyStateFul.readystateChange(this, module.exports.PhantomBrowser.EXITED)
                  }

                  const onoutdata = buffer => {
                      console.log("stdout", buffer.toString())
                  }

                  const onerrdata = buffer => {
                      console.log("stderr", buffer.toString())
                  }

                  this.child.addListener("exit", onchildexit)
                  this.child.stdout.addListener("data", onoutdata)
                  this.child.stderr.addListener("data", onerrdata)
                  process.addListener("exit", onprocessexit)
              })
              .then(() => new Promise(resolve => nextTick(() => {
                  ReadyStateFul.readystateChange(this, module.exports.PhantomBrowser.READY)
                  resolve()
              })))
              .catch(e => this.dispatchEvent("error", e))

            browsers.get(this).set("ready", ready)
        }
      , child: { enumerable: true,
            get: function(){ return browsers.get(this).get("child") }
        }
      , parameters: { enumerable: true,
            get: function(){ return browsers.get(this).get("parameters") }
        }
      , port: { enumerable: true,
            get: function(){ return browsers.get(this).get("port") }
        }
      , uid: { enumerable: true,
            get: function(){ return browsers.get(this).get("uid") }
        }

      , run: { enumerable: true,
            value: function(task){
                return browsers.get(this).get("ready")
                  .then(() => new Promise(resolve => {
                      if ( !(task) instanceof PhantomTask )
                        throw new TypeError(ERR_PHANTOM_TASK)

                      const body = Buffer.from(serialize({
                          task: task.uid
                        , handler: task.sandbox
                        , id: this.uid
                      }))

                      const request = httpRequest({
                          hostname: "localhost"
                        , port: this.port
                        , path: "/"
                        , method: "POST"
                      })

                      const onresponse = response => {
                          request.removeListener("response", onresponse)

                          const ondata = data => {
                              console.log("data", data)
                          }

                          const onend = () => {
                              console.log("end")
                              response.removeListener("data", ondata)
                              response.removeListener("end", onend)
                          }

                          response.addListener("data", ondata)
                          response.addListener("end", onend)
                      }

                      const onerror = error => {
                          request.removeListener("response", onresponse)
                          request.removeListener("error", onerror)
                      }

                      request.addListener("response", onresponse)
                      request.addListener("error", onerror)

                      request.setHeader("Content-Type", "application/x-www-form-urlencoded")
                      request.setHeader("Content-Length", body.length)
                      request.end(body)

                      setTimeout(resolve, 5000)
                  }))
            }
        }
    }
})
