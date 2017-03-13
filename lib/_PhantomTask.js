"use strict"

const { class:klass } = require("ippankiban/lib/class")
const { typeOf } = require("ippankiban/lib/type")

const { Node } = require("ippankiban/lib/Node")
const { UID: { uid } } = require("ippankiban/lib/UID")

module.exports.PhantomTask = klass(Node, statics => {
    const tasks = new WeakMap

    return {
        constructor: function({ sandbox }){
            tasks.set(this, new Map)
            Node.call(this)

            sandbox = typeOf(sandbox) == "function" ? sandbox.toString() : function(){
                throw new TypeError(ERR_NOT_A_FUNCTION)
            }()

            tasks.get(this).set("sandbox", sandbox)
        }

      , sandbox: { enumerable: true,
            get: function(){
                return tasks.get(this).get("sandbox")
            }
        }
      , uid: { enumerable: true,
            get: function(){ return tasks.get(this).get("uid") }
        }
    }
})
