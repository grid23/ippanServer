"use strict"

const argv = new Set( process.argv.slice(2) )
const { execFileSync } = require("child_process")

module.exports.VERBOSE = argv.has("--VERBOSE") || argv.has("--verbose")
module.exports.DEBUG = argv.has("--DEBUG") || argv.has("--debug")

const sysctl = new Map
module.exports.sysctl = new Proxy(Object.create(null), {
    get: (t, k) => sysctl.has(k) ? sysctl.get(k) : null
})

try {
    execFileSync("sysctl", ["-a"]).toString().split(/\r\n|\r|\n/)
                  .filter(v => !!v)
                  .map(conf => {
                      const idx = conf.indexOf("=")
                      const key = conf.slice(0, idx).trim()
                      let value = conf.slice(idx + 1).trim()
                      value = !isNaN(parseInt(value)) ? parseInt(value)
                            : value

                      if ( module.exports.DEBUG )
                        console.log(`[${__filename}] setting systcl: ${key} => ${value}`)

                      return [key, value]
                  })
                  .forEach(([key, value]) => sysctl.set(key, value))
} catch(e) {
    console.error(e)
}
