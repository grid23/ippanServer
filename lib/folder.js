"use strict"

const { ERR_NOT_A_FOLDER } = require("./errors")
const { resolve:resolvePath } = require("path")
const { type:typeOf } = require("ippankiban/lib/type")
const { stat, mkdir } = require("fs")

const mode = 0O0777 & (~process.umask())

module.exports.folder = (...args) => new Promise((resolve, reject) => {
    const cb = typeOf(args[args.length-1]) == "function" ? args.pop() : null
    const to = args.shift()
    const from = args.shift() || "/tmp" // don't let the user access / by error

    const onresolve = v => {
        if ( cb ) cb(null, v)
        resolve(v)
    }

    const onreject = e => {
        if ( cb ) cb(e)
        reject(e)
    }

    const tree = to.split("/")
                    .filter(v => !!v)
                    .map( (v, i, a) => a.slice(0, i+1).join("/") )

    let processing = Promise.resolve()
    while ( tree.length ) {
        const dir = tree.shift()
        processing = processing.then(() => new Promise((resolve, reject) => {
            const realpath = resolvePath(from, dir)
            stat(realpath, (err, stats) => {
                if ( err && err.code == "ENOENT" )
                  return mkdir(realpath, mode, err => {
                      if ( err && err.code !== "EEXIST" )
                        return reject(err)
                      resolve(realpath)
                  })
                else if ( err )
                  return reject(err)

                if ( !stats.isDirectory() )
                  return reject(new Error(ERR_NOT_A_FOLDER))

                resolve(realpath)
            })
        }))
    }

    processing.then(onresolve, onreject)
})
