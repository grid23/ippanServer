"use strict"

const { ERR_NO_AVAIL_PORTS } = require("./errors")
const { typeOf } = require("ippankiban/lib/type")

const MIN = 1025
const MAX = 49151

const { Server } = require("http")
const reserved = new Set
let timer = null
const clearTimer = () => reserved.clear()

module.exports.getAvailablePort = ({min=MIN, max=MAX}) => new Promise(resolve => {
    let port = min

    while ( port <= max ) {
        try {
            const server = new Server

            if ( reserved.has(port) )
              throw new Error("reserved")

            server.listen(port)
            server.close()

            reserved.add(port)

            clearTimeout(timer)
            timer = setTimeout(clearTimer, 1000)

            return resolve(port)
        } catch (e) {
            port += 1
        }
    }

    throw new Error(ERR_NO_AVAIL_PORTS)
})
