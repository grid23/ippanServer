"use strict"

const { ERR_NO_AVAIL_PORTS } = require("./errors")
const { typeOf } = require("ippankiban/lib/type")

const MIN = 1025
const MAX = 49151

const { Server } = require("http")

module.exports.getAvailablePort = ({min=MIN, max=MAX}) => new Promise(resolve => {
    let port = min

    while ( port <= max ) {
        try {
            const server = new Server
            server.listen(port)
            server.close()

            return resolve(port)
        } catch (e) {
            port += 1
        }
    }

    throw new Error(ERR_NO_AVAIL_PORTS)
})
