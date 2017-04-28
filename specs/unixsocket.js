"use strict"

const argv = new Set( process.argv.slice(2) )
const VERBOSE = argv.has("--VERBOSE") || argv.has("--verbose")
const USOCK_BUFFER_SIZE = function(str){
    if ( str ) return parseInt(str.split("=").slice(-1), 10)
    return 8192 //TODO get the OS max buffer size somehow
}([...argv].filter(v => v.indexOf("--usock_buffer") == 0 )[0])

const lorem = `Lorem ipsum dolor sit amet, consectetur adipiscing elit. Phasellus volutpat diam quis bibendum facilisis. Phasellus eget volutpat erat. Maecenas nec pellentesque turpis. Ut aliquam ullamcorper euismod. Curabitur tempus pellentesque ornare. Mauris non mattis leo, eget elementum arcu. Suspendisse euismod euismod laoreet. Mauris sit amet est fermentum, dignissim massa at, tempor tortor. Suspendisse potenti. Praesent pharetra sodales dui, ut tristique mi euismod convallis. Morbi et cursus ligula. Praesent varius tincidunt justo in aliquet.
Nam semper eleifend libero, vitae laoreet libero semper eget. Phasellus blandit aliquet volutpat. Morbi elementum eros sit amet sem fermentum hendrerit. Integer blandit finibus urna, vel molestie dui porta a. Proin volutpat laoreet est, non aliquam nibh accumsan non. Suspendisse potenti. Sed pharetra, nisi eget luctus sagittis, libero augue varius quam, vel laoreet dolor purus nec nulla. Cras tellus ex, semper sit amet erat at, volutpat ullamcorper leo. Etiam rhoncus mauris nisi, et lacinia mi venenatis ut. Vivamus ultricies faucibus ex. Donec bibendum ipsum ut ex dapibus, viverra auctor lorem tempor. Pellentesque eget sagittis metus. Etiam eu lectus augue.
Sed semper dolor non fermentum laoreet. Maecenas sodales leo ipsum, non hendrerit ante dignissim vitae. Nam eu facilisis tortor. Sed faucibus lacus sit amet convallis pretium. Nulla facilisi. Fusce vitae augue velit. Pellentesque tellus enim, iaculis sed ultrices at, semper egestas mi. Duis at hendrerit nisl. Mauris convallis neque lectus, a pharetra mi euismod rhoncus. Suspendisse convallis, magna vitae sagittis ultrices, arcu elit faucibus libero, sit amet viverra libero ipsum vel justo. Mauris feugiat faucibus elit, varius venenatis tortor ornare non. Donec a ullamcorper mi. Donec ac facilisis mi. Curabitur iaculis urna augue, at volutpat eros ornare eu. Integer euismod iaculis risus nec efficitur. Phasellus et nibh molestie, ullamcorper dui at, suscipit justo.
Vivamus sem nibh, molestie eu mi nec, tempor fringilla ipsum. Etiam mattis mollis turpis, dictum tristique ligula tincidunt vitae. Curabitur mattis sapien at aliquam convallis. Nulla luctus massa mauris, ac eleifend purus euismod pharetra. Maecenas vel nisi eu nibh porta consectetur. Donec scelerisque dolor at justo molestie, ac sodales arcu pharetra. Aenean rhoncus odio ac arcu ornare auctor. Quisque non justo sed tellus suscipit dapibus non et erat. Etiam quis arcu vulputate, ullamcorper sapien faucibus, interdum diam. Quisque rhoncus quam a erat euismod maximus. Donec finibus turpis et ex vehicula, porta molestie est scelerisque. Morbi auctor tempus pretium. Nam vitae ligula eu nibh fermentum accumsan nec varius orci. Aenean sollicitudin convallis ligula, nec malesuada eros aliquet nec. Duis porttitor sed ligula eget semper.
Proin vel auctor magna, et vulputate sapien. Cras leo massa, fringilla ut interdum dictum, vestibulum eget libero. Interdum et malesuada fames ac ante ipsum primis in faucibus. In a risus ligula. In pretium accumsan sem tincidunt egestas. Aliquam erat volutpat. Curabitur et consequat erat. Morbi eu dictum sapien. Aenean et tortor at leo dictum volutpat. Donec a fringilla diam. Nunc non ornare purus. Ut vestibulum facilisis ante et luctus. Aliquam nulla odio, gravida at lorem et, viverra consequat sapien.
Vivamus ex diam, aliquet in urna quis, consectetur congue magna. Aliquam in tellus sodales, molestie metus sed, fermentum risus. Donec vel metus auctor, euismod ipsum ut, auctor nibh. Maecenas vel sagittis lorem. Curabitur et eleifend lacus, a aliquet nibh. Mauris consectetur molestie sem, vel vestibulum orci ultrices in. Morbi volutpat, neque ac posuere suscipit, diam orci fermentum tortor, nec consectetur augue arcu nec tortor. Pellentesque erat nisi, pellentesque ut neque et, cursus vehicula justo. Nullam consectetur metus risus, in faucibus enim venenatis et.
Proin turpis neque, consectetur quis semper vitae, tincidunt vel nulla. Integer imperdiet pellentesque risus, et efficitur est commodo et. Nulla malesuada eros vitae augue euismod consectetur. Nam accumsan quam sed ipsum varius cursus. Nunc velit sapien, efficitur sed eros in, elementum mattis diam. Nulla facilisi. Aenean vehicula magna vitae porttitor congue. Donec dictum, est vitae auctor vehicula, quam enim cursus orci, a porttitor tortor urna eget ante. Mauris dictum, erat nec sagittis sagittis, ex risus dignissim ipsum, nec vehicula enim felis eget turpis. Suspendisse arcu justo, pretium vel tincidunt quis, consequat ullamcorper odio. Vivamus efficitur dolor non risus semper ultrices. Aliquam et suscipit eros. Maecenas et augue non neque egestas finibus sed in augue.
Fusce consequat quam vel nisl dignissim aliquet. In feugiat elementum auctor. Orci varius natoque penatibus et magnis dis parturient montes, nascetur ridiculus mus. Donec aliquam nulla lorem, sagittis lacinia libero tempus at. Donec feugiat, ante nec congue lobortis, justo eros egestas sapien, euismod porttitor justo augue non ipsum. Nulla commodo libero at tempus faucibus. Vestibulum id purus a tellus auctor laoreet et sit amet lacus. Nunc faucibus, lorem nec elementum consequat, tortor lorem lobortis nulla, nec facilisis ligula ex quis turpis. Cras quis augue elit. Integer ac fermentum felis. Cras nec orci nec dolor facilisis tempor. Etiam facilisis, massa a pellentesque convallis, nisi urna efficitur dolor, at porta magna ligula a justo. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Nam ultricies enim id facilisis hendrerit. Suspendisse finibus turpis nisl, tempus pretium est vulputate eu.
Sed tempor mauris ut auctor volutpat. Ut molestie magna eget interdum blandit. Maecenas lacinia mi sed elit sollicitudin mattis. Suspendisse a dui id magna bibendum molestie vel sed purus. Nam egestas ultrices orci, eget mattis eros lacinia et. Vestibulum ac blandit erat. Phasellus porta commodo placerat. Morbi pretium porttitor dapibus. Integer pulvinar, nisl sit amet accumsan posuere, tellus lectus egestas mauris, quis malesuada eros erat a tortor. Integer eu euismod nisi.
Praesent sem risus, facilisis ac semper ut, luctus nec ligula. Ut vitae fermentum velit, vitae tempor turpis. Aliquam posuere nisl vitae suscipit maximus. Praesent dapibus, nunc et tristique euismod, nibh nisi varius orci, et ullamcorper nisl turpis ut est. Proin nec justo vel ipsum pulvinar tincidunt. Nulla a ultricies sapien. Etiam urna ex, fermentum nec tempor a, tempor in quam. Nunc nisl arcu, lobortis quis dignissim sed, pulvinar eget mauris. Fusce in sodales est.
Aliquam condimentum nibh quis velit bibendum elementum. Quisque mollis orci consectetur urna fermentum, non sodales purus lobortis. Donec varius, sem vel pretium gravida, urna magna ullamcorper nisl, eget condimentum nisl nisl id metus. Vestibulum ante ipsum primis in faucibus orci luctus et ultrices posuere cubilia Curae; Fusce quis tellus ligula. Pellentesque iaculis nulla ac felis elementum semper. Vivamus sed purus eu tellus tincidunt posuere eget sed nisi.
Vivamus porttitor enim eu diam volutpat commodo. Praesent sit amet venenatis purus, vel ultricies mi. Nam eget facilisis neque. Nunc non tincidunt justo. In nec nisl bibendum, dignissim urna nec, rutrum odio. Sed eu varius felis, vel porta risus. Nulla vitae ultricies quam. Sed lorem justo, laoreet sed ante ac, suscipit venenatis lacus. Nam pretium suscipit posuere. Donec eu urna consectetur, aliquet augue euismod, semper ante. Curabitur interdum sed enim at dignissim.
Cras tellus ipsum, maximus in lorem non, congue hendrerit lorem. Aliquam ac lorem eget nisi sollicitudin vestibulum a eget urna. Donec massa risus, aliquet nec lacus eu, tristique vestibulum velit. Donec laoreet rhoncus magna in pellentesque. Aenean hendrerit, nulla et tincidunt dictum, sapien nisi congue justo, eu condimentum dui nisi nec libero. Donec interdum semper augue, a porta arcu dapibus quis. Vestibulum imperdiet quam diam, id porttitor dui vulputate non. Etiam convallis metus eu velit hendrerit blandit. Mauris odio tellus, lobortis vestibulum ex sit amet, vestibulum congue metus.
Mauris a nibh tincidunt erat auctor iaculis. Maecenas luctus eros et pulvinar sodales. Nunc sodales purus elit, et consectetur ex feugiat vitae. Integerpharetra lobortis velit id suscipit. Fusce consectetur dui vitae pretium laoreet. Vestibulum elementum placerat commodo. Praesent eget ipsum quis justo euismod laoreet. Curabitur leo tortor, fringilla eu tristique at, aliquet eu lorem. Vestibulum ut neque neque. Suspendisse sit amet elit pharetra, tempor nisi vel, eleifend urna. Phasellus sed sagittis augue. Nam placerat condimentum posuere. Vestibulum in aliquet felis. Cras felis libero, sollicitudin ac nunc sit amet, feugiat pellentesque mi.
Sed at viverra ligula, id vestibulum nulla. Nunc quis velit quis sapien mollis vestibulum. Praesent lobortis dui ut gravida rutrum. Donec maximus ullamcorper dolor sit amet scelerisque. Nunc at orci id elit hendrerit tempor. Ut ultrices risus in dui luctus eleifend. Maecenas quis felis eget dui porttitor pharetra. In pellentesque accumsan mi ut egestas. In nec arcu ipsum. Phasellus at iaculis diam, non iaculis sem. Vivamus ut metus et ligula eleifend vulputate.
Cras ligula dui, dignissim et gravida quis, interdum in lacus. Sed sagittis mollis lacus sed viverra. Maecenas vestibulum, tortor in sagittis egestas, ipsum lacus feugiat ipsum, ut scelerisque nulla nunc non magna. Aenean non nisl tristique, cursus nunc ac, ullamcorper est. Aenean quis molestie dui, eu pellentesque nulla. Aliquam a velit mauris. Suspendisse maximus orci nulla, eget vulputate tellus blandit et.
Nam et feugiat sem. Aliquam pretium ligula arcu, sed aliquam nunc viverra sit amet. In ut ex risus. Sed at tempor enim. Nullam ut euismod ligula, eget pulvinar urna. Nunc nec libero nec eros dapibus volutpat. Duis viverra pharetra rutrum. Cras ut fringilla lectus, quis aliquam nulla. Nunc posuere pellentesque elit, malesuada eleifend nunc dapibus ac. Morbi hendrerit porttitor enim amet.`


const { pid } = process
const { UID:{uid} } = require("ippankiban/lib/UID")

const { UnixSocket } = require("../lib/UnixSocket")
const { UnixSocketServer } = require("../lib/UnixSocketServer")

const message = Buffer.alloc(USOCK_BUFFER_SIZE*10.3, lorem)

new Promise(resolve => {
    const server = new UnixSocketServer(`/tmp/${uid()}.sock`)

    const onlistening = e => {
        server.removeEventListener("listening", onlistening)
        resolve(server)
    }

    server.addEventListener("socket", ({ socket }) => {
        socket.addEventListener("message", e => {
    //        console.log("\nUnixSocketServer <= message (raw)", e.unmask())
        })
        socket.addEventListener("textframe", e => {
            //console.log(`\nUnixSocketServer <= textframe`, e.unmask())
            if ( e.unmask() === message.toString() )
              socket.send(e.unmask())
            else
              console.log("<= server:  message corruped\n\noriginal:", message.toString(), "\n\ncorruped:", e.unmask(), "\n\n")
        })

    })

    server.addEventListener("listening", onlistening)
})
.then(server => {

    for (let i = 0; i < 100; i++ ) {
        const unixSocket = new UnixSocket(server.socket)


        if ( VERBOSE )
          console.log(`\n[${__filename}, pid: ${pid}] test message is ${message.length} bytes long`)

        unixSocket.addEventListener("message", ({data:msg}) => {
            //console.log("\nunixSocket <= message", msg)
            if ( msg !== message.toString() )
              console.log("<= unixsocket:  message corruped\n", msg)
        })

        unixSocket.send(message)
    }
})
