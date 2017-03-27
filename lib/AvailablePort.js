"use strict"

const { ERR_NO_AVAIL_PORTS, WARN_INVERTING_MIN_MAX } = require("./errors")
const MAX = 49151
const MIN = 1025

const TMP = "/tmp" //TODO find alternatives on alternative OS
const PATH = "./.ippanServer"
const FILE = "./ports"
const LOCK_FILE = "./.ports--lock"

const { class:klass, singleton } = require("ippankiban/lib/class")
const { createReadStream, createWriteStream, mkdir, statSync, unlinkSync, watchFile:watch, unwatchFile:unwatch, writeFileSync } = require("fs")
const { resolve:resolvePath } = require("path")
const { nextTick } = process
const { createInterface:createReadlineInterface } = require("readline")
const { typeOf } = require("ippankiban/lib/type")
const { inherits } = require("util")

const { EventTarget } = require("ippankiban/lib/EventTarget")
const { Duplex } = require("stream")
const { ReadyStateFul } = require("ippankiban/lib/ReadyStateFul")
const { Server } = require("http")

module.exports.AvailablePort = singleton(EventTarget, ReadyStateFul, statics => {
    const duplexes = new WeakMap
    const directory = resolvePath(TMP, PATH)
    const filepath = resolvePath(TMP, PATH, FILE)
    const lock_filepath = resolvePath(TMP, PATH, LOCK_FILE)

    Object.defineProperties(statics, {
        UNINITIALIZED: { enumerable: true, value: 0b0 }
      , [0b0]: { enumerable: true, value: "UNINITIALIZED"}
      , INITIALIZING: { enumerable: true, value: 0b1 }
      , [0b1]: { enumerable: true, value: "INITIALIZING" }
      , BUSY: { enumerable: true, value: 0b10 }
      , [0b10]: { enumerable: true, value: "BUSY" }
      , LOCKED: { enumerable: true, value: 0b11 }
      , [0b11]: { enumerable: true, value: "LOCKED" }
      , IDLE: { enumerable: true, value: 0b100 }
      , [0b100]: { enumerable: true, value: "IDLE" }


      , TIMER: { enumerable: true, value: 5000 }

      , getRandomNumber: { enumerable: true,
            value: function({ min=MIN, max=MAX } = {}){
                min = parseInt(min, 10)
                max = parseInt(max, 10)

                if ( MAX < MIN ) {
                    [min, max] = [max, min]
                    console.warn("[ippanServer, AvailablePort.js]", WARN_INVERTING_MIN_MAX)
                }

                min = Math.max(MIN, min)
                max = Math.min(MAX, max)

                return Math.round(Math.random() * (max - min)) + min
            }
        }

      , getAvailablePort: { enumerable: true,
            value: (...args) => {
                const avail = new module.exports.AvailablePort
                return Reflect.apply(avail.available, avail, args)
            }
        }
    })

    return {
        constructor: function(){
            duplexes.set(this, new Map)
            Duplex.call(this)

            duplexes.get(this).set("reserved", new Set)
            duplexes.get(this).set("ready", Promise.resolve()
            .then(new Promise(resolve => nextTick(() => {
                ReadyStateFul.readystateChange(this, module.exports.AvailablePort.INITIALIZING)
                resolve()
            })))
            .then(() => new Promise(resolve => mkdir(resolvePath(TMP, PATH), 0O0775 & (~process.umask()), err => {
                if (!err || err.code === "EEXIST")
                  return resolve()
                throw err
            })))
            .then(() => ReadyStateFul.readystateChange(this, module.exports.AvailablePort.IDLE) ))
            duplexes.get(this).set("ops", duplexes.get(this).get("ready"))
        }
      , _read: { enumerable: false,
            value: function(...args){
                duplexes.get(this).set("ops", duplexes.get(this).get("ops")
                .then(() => {
                    if ( this.readystate !== module.exports.AvailablePort.BUSY )
                      ReadyStateFul.readystateChange(this, module.exports.AvailablePort.BUSY)

                })
                .then(() => new Promise(resolve => {

                    //TODO listen to drain to resolve
                    const stream = createReadStream(filepath)
                    Reflect.apply(stream.read, stream, args)


                    nextTick(() => {
                        if ( this.readystate !== module.exports.AvailablePort.IDLE )
                          ReadyStateFul.readystateChange(this, module.exports.AvailablePort.IDLE)
                    })
                    resolve(stream)
                })))

                return duplexes.get(this).get("ops")
            }
        }
      , _write: { enumerable: false,
            value: function(...args){
                duplexes.get(this).set("ops", duplexes.get(this).get("ops")
                .then(() => {
                    if ( this.readystate !== module.exports.AvailablePort.BUSY )
                      ReadyStateFul.readystateChange(this, module.exports.AvailablePort.BUSY)
                })
                .then(() => new Promise(resolve => {

                    //TODO listen to drain to resolve
                    const stream = createWriteStream(filepath, { flags: "a+" })
                    const ondrain = e => {
                        stream.removeListener("drain", ondrain)
                        resolve(stream)
                    }

                    Reflect.apply(stream.write, stream, args)

                    nextTick(() => {
                        if ( this.readystate !== module.exports.AvailablePort.IDLE )
                          ReadyStateFul.readystateChange(this, module.exports.AvailablePort.IDLE)
                    })

                    //stream.addListener("drain", ondrain) //TODO listen to drain to resolve
                    resolve(stream)
                })))
            }
        }
      , available: { enumerable: true,
            value: function({min=MIN, max=MAX, verbose=false} = {}, cb=Function.prototype){
                return this.update()
                .then(() => new Promise(resolve => setTimeout(resolve, module.exports.AvailablePort.getRandomNumber({min:64, max:256}))))
                .then(() => new Promise((resolve, reject) => {
                    try {
                        statSync(lock_filepath)

                        if ( this.readystate == module.exports.AvailablePort.LOCKED )
                          ReadyStateFul.readystateChange(this, module.exports.AvailablePort.IDLE)
                    } catch(e) {
                        writeFileSync(lock_filepath)
                        if ( verbose ) console.log("[ippanServer] lock file created")
                        return resolve()
                    }

                    if ( this.readystate == module.exports.AvailablePort.IDLE )
                      ReadyStateFul.readystateChange(this, module.exports.AvailablePort.LOCKED)
                    reject()
                }))
                .then(() => new Promise(resolve => {
                    while ( 1 ) {
                        let port = module.exports.AvailablePort.getRandomNumber({min, max})

                        try {
                            const server = new Server

                            if ( this.reserved.has(port) )
                              throw new Error("reserved")

                            server.listen(port)

                            const onclose = e => {
                              server.removeListener("close", onclose)

                              this.reserve(port)
                               .then(() => resolve(port))
                            }

                            server.addListener("close", onclose)
                            server.close()
                            break
                        } catch (e) { console.log(e) }
                    }
                }))
                .catch(() => new Promise(resolve => {
                        if ( verbose ) console.log("[ippanServer] locked")
                        const onchange = e => {
                            unwatch(lock_filepath, onchange)

                            nextTick(() => this.available().then(resolve))
                        }
                        watch(lock_filepath, onchange)
                }))
                .then(port => new Promise((resolve, reject) => {
                  try {
                    unlinkSync(lock_filepath)
                    if ( verbose ) console.log("[ippanServer] lock file deleted")
                    setTimeout(()=> resolve(port), module.exports.AvailablePort.getRandomNumber({min:64, max:256}))
                  } catch(e){
                      reject(e)
                  }
                }))
                .then(port => {
                    cb(null, port)
                    return port
                })
            }

        }
      , reserve: { enumerable: true,
            value: function(port){
                if ( !port || typeOf(port) !== "number" )
                  return Promise.reject(new TypeError(ERR_NUMBER_EXPECTED))
                return new Promise(resolve => this.write(`\n${port} ${Date.now()}`, resolve))
            }
        }
      , reserved: { enumerable: true,
            get: function(){ return duplexes.get(this).get("reserved") }
        }
      , update: { enumerable: true,
            value: function(){
                duplexes.get(this).set("ops", duplexes.get(this).get("ops")
                .then(() => {
                    if ( this.readystate !== module.exports.AvailablePort.BUSY )
                      ReadyStateFul.readystateChange(this, module.exports.AvailablePort.BUSY)
                })
                .then(() => new Promise(resolve =>{
                    this.reserved.clear()
                    const stream = createReadStream(filepath)
                    const lines = createReadlineInterface({ input:stream })

                    const onend = err => {
                        lines.removeListener("error", onerror)
                        lines.removeListener("line", online)
                        lines.removeListener("close", onend)

                        if ( err )
                          return reject(err)
                        resolve()
                    }

                    const onerror = err => onend(err)

                    const online = line => {
                        if ( !line.length )
                          return

                        const [port, ts] = line.split(" ")
                        if ( (Date.now() - ts) < module.exports.AvailablePort.TIMER )
                          this.reserved.add(port)
                    }

                    lines.addListener("error", onerror)
                    lines.addListener("line", online)
                    lines.addListener("close", () => onend())
                }))
                .then(() => new Promise(resolve => {
                    const stream = createWriteStream(filepath, { flags: "w" })
                    const now = Date.now()

                    const onend = () => {
                        stream.removeListener("close", onend)
                        resolve()
                    }

                    stream.addListener("close", onend)
                    stream.end([...this.reserved].join(` ${now}\n`), "utf8")
                }))
                .then(() => nextTick(() => {
                        if ( this.readystate !== module.exports.AvailablePort.IDLE )
                          ReadyStateFul.readystateChange(this, module.exports.AvailablePort.IDLE)
                })))

                return duplexes.get(this).get("ops")
            }
        }
    }
})
inherits(module.exports.AvailablePort, Duplex)
