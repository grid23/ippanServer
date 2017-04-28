"use strict"

const argv = new Set( process.argv.slice(2) )
const VERBOSE = argv.has("--VERBOSE") || argv.has("--verbose")

module.exports.USOCK_BUFFER_SIZE = function(str){
    //TODO get the OS max buffer size somehow
    //TODO substract max padding of the websocket message diagram

    if ( str ) return parseInt(str.split("=").slice(-1), 10) -16
    return 8192 -16
}([...argv].filter(v => v.indexOf("--usock_buffer") == 0 )[0])

if ( VERBOSE )
  console.log(`[${__filename}, pid(${process.pid})] max unix socket buffer size set as ${module.exports.USOCK_BUFFER_SIZE} bytes`)
