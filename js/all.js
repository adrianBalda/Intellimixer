/* Global variables and objects */

// Audio stuff
var audio_manager = new AudioManager();
var MONO_MODE = true;
let model
let sampleValuesInLatentSpace
let a

// Sounds and content
var default_query = "files/BlogPostDemo.json"
var default_audio_query = "files/audio2d.json"
var default_audio = []
var default_query_model = "files/model/model.json"
var sounds = [];
var extra_descriptors = undefined;
var map_features = undefined;
var map_type = "tsne"
var n_pages = 3;
var n_pages_received = 0;
var all_loaded = false;
var last_selected_sound_id = undefined;

// t-sne and xy map
var max_tsne_iterations = 500;
var current_it_number = 0;
var epsilon = 10;
var perplexity = 10;
var tsne = undefined;
var max_xy_iterations = 50;
var map_xy_x_max = undefined;
var map_xy_x_min = undefined;
var map_xy_y_max = undefined;
var map_xy_y_min = undefined;

// Canvas and display stuff
var canvas = document.querySelector('canvas');
var ctx = canvas.getContext('2d');
var w = window.innerWidth;
var h = window.innerHeight;
var default_point_modulation = 0.6;
var disp_scale = Math.min(w, h);
var center_x = undefined;  // Set in start()
var center_y = undefined;  // Set in start()
var zoom_factor = undefined;  // Set in start()
var rotation_degrees = undefined;  // Set in start()
var min_zoom = 0.2;
var max_zoom = 15;

/* Setup and app flow functions */

async function getModels() {
    const uploadJSONInput = document.getElementById('upload-json');
    const uploadWeightsInput = document.getElementById('upload-weights');
    const model = await tf.loadLayersModel(tf.io.browserFiles(
        [uploadJSONInput.files[0], uploadWeightsInput.files[0]]));
}

function sampleFromLatentSpace(mu, log_variance) {
    let epsilon = jStat.normal.sample(0, 1);
    return mu + Math.exp(log_variance / 2) * epsilon;
}

function windowCosineMateo(bufferSize, type = "hamming") {
    windowValues = []
    for (let i = 0; i < bufferSize; i++) {
        windowValues[i] = Math.sin(Math.PI / 1024 * (i + 0.5));
    }
    return windowValues;
}

function centerPad(data, framelength) {
    let zerosArray = Array(framelength / 2).fill(0);
    return zerosArray.concat(data).concat(zerosArray)
}

function zeroPad(data, framelength) {
    while (data.length % framelength !== 0) {
        data.push(0);
    }
    return data;
}

function processSpectrogram(signalChunk, framelength) {
    let data = math.dotMultiply(signalChunk, windowCosineMateo(framelength));
    return mclt(data);
}

function spectrogramMateo(data, framelength = 1024) {
    let outlength = data.length;
    let overlap = 2;
    let hopsize = framelength / overlap;
    let signal = data;

    let centered = true;
    if (centered) {
        signal = centerPad(signal, framelength);
    }
    signal = zeroPad(signal, framelength);

    values = [];
    for (let chunk = 0; chunk <= signal.length / hopsize; chunk++) {
        values.push(processSpectrogram(signal.slice(chunk * hopsize, (chunk * hopsize) + framelength), framelength));
    }

    return values;
}

function mclt(x, odd = true) {
    let N = Math.floor(x.length / 2);
    let n0 = (N + 1) / 2;
    let pre_twiddle = [];
    let offset = 0;
    let outlen = 0;
    if (odd) {
        outlen = N;
        for (let i = 0; i < N * 2; i++) {
            pre_twiddle.push(math.exp(math.complex(0, -1 * math.pi * i / (N * 2))));
        }
        offset = 0.5;
    } else {
        outlen = N + 1;
        pre_twiddle = 1.0;
        offset = 0.0;
    }
    let post_twiddle = [];
    for (let i = 0; i < outlen; i++) {
        post_twiddle.push(math.exp(math.complex(0, -1 * math.pi * n0 * (i + offset) / N)));
    }

    X = []
    aux_mul = math.dotMultiply(x, pre_twiddle);
    for (let k = 0; k < N * 2; k++) {
        aux_mul2 = -2 * math.pi * k / (N * 2);
        X[k] = []
        for (let ii = 0; ii < N * 2; ii++) {
            X[k].push(math.dotMultiply(aux_mul[ii], math.exp(math.complex(0, aux_mul2 * ii))))
        }
        X[k] = X[k].reduce((a, b) => math.add(a, b));
    }

    if (!odd) {
        X[0] *= math.sqrt(0.5);
        X[X.lenght - 1] *= math.sqrt(0.5);
    }

    return math.dotMultiply(math.dotMultiply(X.slice(0, X.length / 2), post_twiddle), math.sqrt(1 / N));
}

function FFTNayuki(n) {

    this.n = n;
    this.levels = -1;
    for (var i = 0; i < 32; i++) {
        if (1 << i == n) {
            this.levels = i;  // Equal to log2(n)
        }
    }
    if (this.levels == -1) {
        throw "Length is not a power of 2";
    }
    this.cosTable = new Array(n / 2);
    this.sinTable = new Array(n / 2);
    for (var i = 0; i < n / 2; i++) {
        this.cosTable[i] = Math.cos(2 * Math.PI * i / n);
        this.sinTable[i] = Math.sin(2 * Math.PI * i / n);
    }
    /*
     * Computes the discrete Fourier transform (DFT) of the given complex vector, storing the result back into the vector.
     * The vector's length must be equal to the size n that was passed to the object constructor, and this must be a power of 2. Uses the Cooley-Tukey decimation-in-time radix-2 algorithm.
     */
    this.forward = function (real, imag) {
        var n = this.n;

        // Bit-reversed addressing permutation
        for (var i = 0; i < n; i++) {
            var j = reverseBits(i, this.levels);
            if (j > i) {
                var temp = real[i];
                real[i] = real[j];
                real[j] = temp;
                temp = imag[i];
                imag[i] = imag[j];
                imag[j] = temp;
            }
        }

        // Cooley-Tukey decimation-in-time radix-2 FFT
        for (var size = 2; size <= n; size *= 2) {
            var halfsize = size / 2;
            var tablestep = n / size;
            for (var i = 0; i < n; i += size) {
                for (var j = i, k = 0; j < i + halfsize; j++, k += tablestep) {
                    var tpre = real[j + halfsize] * this.cosTable[k] +
                        imag[j + halfsize] * this.sinTable[k];
                    var tpim = -real[j + halfsize] * this.sinTable[k] +
                        imag[j + halfsize] * this.cosTable[k];
                    real[j + halfsize] = real[j] - tpre;
                    imag[j + halfsize] = imag[j] - tpim;
                    real[j] += tpre;
                    imag[j] += tpim;
                }
            }
        }

        // Returns the integer whose value is the reverse of the lowest 'bits' bits of the integer 'x'.
        function reverseBits(x, bits) {
            var y = 0;
            for (var i = 0; i < bits; i++) {
                y = (y << 1) | (x & 1);
                x >>>= 1;
            }
            return y;
        }
    }
    /*
     * Computes the inverse discrete Fourier transform (IDFT) of the given complex vector, storing the result back into the vector.
     * The vector's length must be equal to the size n that was passed to the object constructor, and this must be a power of 2. This is a wrapper function. This transform does not perform scaling, so the inverse is not a true inverse.
     */
    this.inverse = function (real, imag) {
        forward(imag, real);
    }
}


function imclt(X, odd = true) {
    if (!odd && X.length % 2 === 0) {
        throw "Even inverse CMDCT requires an odd number of coefficients"
    }

    if (odd) {
        N = X.length
    }
}

async function start() {

    // Leer audio por defecto para pruebas
    // loadJSON(function (data) {
    //     default_audio = JSON.parse(data)
    // }, default_audio_query);

    // class GaussianDistribution extends tf.layers.Layer {
    //     constructor(latent_space_dim) {
    //         super({});
    //         this.latent_space_dim = latent_space_dim;
    //     }
    //
    //     call(inputs) {
    //         let mu = inputs[0];
    //         console.log(mu)
    //         let log_variance = inputs[1];
    //         console.log(log_variance)
    //         let epsilon = tf.randomNormal([1, this.latent_space_dim.latentSpaceDim], 0, 1, 'float32');
    //         console.log(epsilon)
    //         let sampled_point = mu.add(log_variance.div(tf.scalar(2)).exp().mul(epsilon));
    //         console.log(sampled_point.cast('float32'))
    //         //console.log(tf.tensor(sampled_point).toFloat())
    //
    //         return sampled_point;
    //     }
    //
    //     static get className() {
    //         return 'GaussianDistribution';
    //     }
    // }

    // tf.serialization.registerClass(GaussianDistribution);

    zz = []
    for (let i = 0; i < 2071; i++) {
        zz.push(i)
    }

    spectrogramMateo(zz)

    encoder_model = await tf.loadLayersModel('https://models.seamosrealistas.com/encoder_model/model.json');
    decoder_model = await tf.loadLayersModel('https://models.seamosrealistas.com/decoder_model/model.json');

    let tensor = tf.tensor2d(default_audio, [512, 64], 'float32')
    let [mu_tensor, log_variance_tensor] = encoder_model.predict(tf.reshape(tensor, shape = [1, 512, 64, 1]));
    let mu_latent_space = mu_tensor.dataSync();
    let log_variance_latent_space = log_variance_tensor.dataSync();
    let latent_space_size = mu_latent_space.length;

    sampleValuesInLatentSpace = []
    for (let i = 0; i < latent_space_size; i++) {
        sampleValuesInLatentSpace.push(sampleFromLatentSpace(mu_latent_space[i], log_variance_latent_space[i]));
    }

    let decoder_tensor = tf.tensor(sampleValuesInLatentSpace, [latent_space_size], 'float32');
    let predicted_spectogram_tensor = decoder_model.predict(tf.reshape(decoder_tensor, shape = [1, latent_space_size]));
    let predicted_spectrogram = await predicted_spectogram_tensor.array()
    predicted_spectrogram = predicted_spectrogram[0]


    //const model = tf.sequential();

    // stop all audio
    audio_manager.stopAllBufferNodes();

    // get map descriptors
    setMapDescriptor();

    // update axis labels
    update_axis_labels()

    // Sounds
    sounds = [];
    n_pages_received = 0;
    all_loaded = false;

    // Canvas
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    canvas.addEventListener("mousedown", onMouseDown, false);
    canvas.addEventListener("mouseup", onMouseUp, false);
    canvas.addEventListener("mouseout", onMouseOut, false);
    canvas.addEventListener("wheel", onWheel, false);
    center_x = 0.5;
    center_y = 0.5;
    zoom_factor = 1.0;
    rotation_degrees = 0;

    // Display stuff
    if (w >= h) {
        disp_x_offset = (w - h) / 2;
        disp_y_offset = 0.0;
    } else {
        disp_x_offset = 0.0;
        disp_y_offset = (h - w) / 2;
    }

    // t-sne
    current_it_number = 0;
    var opt = {}
    opt.epsilon = epsilon; // epsilon is learning rate (10 = default)
    opt.perplexity = perplexity; // roughly how many neighbors each point influences (30 = default)
    opt.dim = 2; // dimensionality of the embedding (2 = default)
    // TODO: Añadir nuestro propio modelo de IA
    tsne = new tsnejs.tSNE(opt); // create a tSNE instance

    var online_offline_state = document.getElementById('myonoffswitch').checked;

    if (online_offline_state) {
        console.log("freesound api")
        // how many pages to download
        // num_files = parseInt(document.getElementById('num_of_files').value, 10);
        // n_pages = Math.round(num_files / 150) + 1;


        // "https://freesound.org/apiv2/search/text/?query=" + query + "&" +
        //     "group_by_pack=0&filter=duration:[0+TO+10]&fields=id,previews,name,analysis,url,username,images,ac_analysis" +
        //     extra_descriptors + "&page_size=150" +
        //     "&token=eecfe4981d7f41d2811b4b03a894643d5e33f812&page=" + (i + 1);
    } else {
        // Set query to the json file
        var query = default_query;  //document.getElementById('query_terms_input').value;
        // Get variables for the source type and reverberance
        var source_type = document.getElementById('source_selector').value;
        var reverb_type = document.getElementById('reverb_selector').value;

        // Load the json file
        // TODO: cargar datos de la api de freesound
        loadJSON(function (data) {
            load_data_from_fs_json(data, source_type, reverb_type);
        }, query);
        n_pages = 1; // set n_pages to 1 as we only load one file, a hangover from freesound searching
        document.getElementById('info_placeholder').innerHTML = "Loading from file...";
    }
}

window.requestAnimFrame = (function () { // This is called when code reaches this point
    return window.requestAnimationFrame ||
        window.webkitRequestAnimationFrame ||
        window.mozRequestAnimationFrame ||
        function (callback) {
            window.setTimeout(callback, 1000 / 60);
        };
})();

(function init() { // This is called when code reaches this point
    window.addEventListener("keydown", onKeyDown, false);
    window.addEventListener("keyup", onKeyUp, false);
    setMapDescriptor();
})();

(function loop() {  // This is called when code reaches this point
    if (map_type == "tsne") {
        // Compute new position of sounds in tsne and update sounds xy
        if ((all_loaded == true) && (current_it_number <= max_tsne_iterations)) {
            document.getElementById('info_placeholder').innerHTML = 'Projecting sounds...';
            tsne.step();
            Y = tsne.getSolution();
            var xx = [];
            var yy = [];
            for (i in Y) {
                xx.push(Y[i][0]);
                yy.push(Y[i][1]);
            }
            min_xx = Math.min(...xx);
            max_xx = Math.max(...xx);
            min_yy = Math.min(...yy);
            max_yy = Math.max(...yy);
            var delta_xx = max_xx - min_xx;
            var delta_yy = max_yy - min_yy;
            for (i in sounds) {
                var sound = sounds[i];
                var x = Y[i][0];
                var y = Y[i][1];
                sound.x = -min_xx / delta_xx + x / delta_xx;
                sound.y = -min_yy / delta_yy + y / delta_yy;
                if (delta_xx > delta_yy) {
                    sound.y = sound.y * (delta_yy / delta_xx); // Preserve tsne aspect ratio
                } else {
                    sound.x = sound.x * (delta_xx / delta_yy); // Preserve tsne aspect ratio
                }
                sound.x = sound.x * Math.pow(100, current_it_number / max_tsne_iterations - 1) + 0.5 * (1 - Math.pow(100, current_it_number / max_tsne_iterations - 1)); // Smooth position at the beginning
                sound.y = sound.y * Math.pow(100, current_it_number / max_tsne_iterations - 1) + 0.5 * (1 - Math.pow(100, current_it_number / max_tsne_iterations - 1)); // Smooth position at the beginning
            }
            current_it_number += 1;
        }
        if (current_it_number >= max_tsne_iterations) {
            document.getElementById('info_placeholder').innerHTML = "Done, " + sounds.length + " sounds loaded!";
        }
    } else if (map_type == "xy") {
        // Get sound's xy position and scale it smoothly to create an animation effect
        if ((all_loaded == true) && (current_it_number <= max_xy_iterations)) {
            document.getElementById('info_placeholder').innerHTML = 'Projecting sounds...';
            for (i in sounds) {
                var sound = sounds[i];
                sound.x = sound.computed_x * Math.pow(100, current_it_number / max_xy_iterations - 1) + 0.5 * (1 - Math.pow(100, current_it_number / max_xy_iterations - 1)); // Smooth position at the beginning
                sound.y = sound.computed_y * Math.pow(100, current_it_number / max_xy_iterations - 1) + 0.5 * (1 - Math.pow(100, current_it_number / max_xy_iterations - 1)); // Smooth position at the beginning
            }
            current_it_number += 1;
        }
        if (current_it_number >= max_xy_iterations - 1) {
            document.getElementById('info_placeholder').innerHTML = "Done, " + sounds.length + " sounds loaded!";
        }
    }
    draw();
    requestAnimFrame(loop);
})();


/* Sounds stuff */

function SoundFactory(id, preview_url, analysis, url, name, username, image) {
    this.x = 0.5; //Math.random();
    this.y = 0.5; //Math.random();
    this.rad = 15;
    this.mod_position = Math.random();
    this.mod_inc = 0.1;
    this.mod_amp = default_point_modulation;
    this.selected = false;

    this.id = id;
    this.preview_url = preview_url;
    this.analysis = analysis;

    // Set color of the points
    var color = rgbToHex(
        Math.floor(255 * analysis['sfx']['tristimulus']['mean'][0]),
        Math.floor(255 * analysis['sfx']['tristimulus']['mean'][1]),
        Math.floor(255 * analysis['sfx']['tristimulus']['mean'][2])
    )
    this.rgba = color;

    this.url = url;
    this.name = name;
    this.username = username;
    this.image = image;
}

async function load_model_from_local_json(data) {
    model = tf.loadLayersModel(data);
    console.log('hei po dai')
}

function load_data_from_fs_json(data, source_type, reverb_type) {
    if ((source_type == "all") || (source_type == "") || (source_type == undefined)) {
        // source type not selected, use all sources
        for (i in data['results']) {
            var sound_json = data['results'][i];
            var reverb_match = false;
            if (sound_json['analysis'] != undefined) {
                if (reverb_type == "all") {
                    reverb_match = true
                } else {
                    if (sound_json['analysis']['timbre']['reverb'] == reverb_type) {
                        reverb_match = true
                    }
                }
                if (reverb_match) {
                    var sound = new SoundFactory(
                        id = sound_json['id'],
                        preview_url = sound_json['audio'] || sound_json['previews']['preview-lq-mp3'],
                        analysis = sound_json['analysis'],
                        url = sound_json['url'],
                        name = sound_json['name'],
                        username = sound_json['username'],
                        image = sound_json['image'] || sound_json['images']['spectral_m'],
                    );
                    sounds.push(sound);
                }
            }
        }
    } else {
        // a source type is defined, use only that source type
        //TODO Filter this by reverb_type
        for (i in data['results']) {
            var sound_json = data['results'][i];
            var reverb_match = false;
            if (sound_json['analysis'] != undefined) {
                if (reverb_type == "all") {
                    reverb_match = true
                } else {
                    if (sound_json['analysis']['timbre']['reverb'] == reverb_type) {
                        reverb_match = true
                    }
                }
                if (reverb_match) {
                    var this_name = sound_json['name'];
                    var this_source_type = sound_json['source_type'];
                    var source_match = false;
                    if (source_type.startsWith('-')) {
                        var array_source_type = source_type.split('-');
                        for (j in array_source_type) {
                            if (array_source_type[j] == this_source_type) {
                                source_match = true;
                            }
                        }
                    } else {
                        if (this_source_type == source_type) {
                            source_match = true;
                        }
                    }
                    // get the reverberant charadteristic of the sound and compare to json file
                    if (source_type.startsWith('-')) {
                        var array_source_type = source_type.split('-');
                        for (j in array_source_type) {
                            if (array_source_type[j] == this_source_type) {
                                source_match = true;
                            }
                        }
                    } else {
                        if (this_source_type == source_type) {
                            source_match = true;
                        }
                    }
                    if ((sound_json['analysis'] != undefined) && source_match) {
                        var sound = new SoundFactory(
                            id = sound_json['id'],
                            preview_url = sound_json['audio'] || sound_json['previews']['preview-lq-mp3'],
                            analysis = sound_json['analysis'],
                            url = sound_json['url'],
                            name = sound_json['name'],
                            username = sound_json['username'],
                            image = sound_json['image'] || sound_json['images']['spectral_m'],
                        );
                        sounds.push(sound);
                    }
                }
            }
        }
    }
    if (n_pages_received == n_pages) {
        if (map_type == "tsne") {
            // Init t-sne with sounds features
            var X = [];
            for (i in sounds) {
                sound_i = sounds[i];
                map_similarity_feature = map_features[0]
                var feature_vector = Object.byString(sound_i, 'analysis.' + map_similarity_feature);
                X.push(feature_vector);
            }
            tsne.initDataRaw(X);
        } else if (map_type == "xy") {
            // Get max and min values for the 2 axis
            for (i in sounds) {
                var sound = sounds[i];
                x = Object.byString(sound, 'analysis.' + map_features[0]);
                y = Object.byString(sound, 'analysis.' + map_features[1]);

                // init max min vars if eneded
                if (i == 0) {
                    map_xy_x_max = x;
                    map_xy_x_min = x;
                    map_xy_y_max = y;
                    map_xy_y_min = y;
                }

                if (x > map_xy_x_max) {
                    map_xy_x_max = x;
                }
                if (y > map_xy_y_max) {
                    map_xy_y_max = y;
                }
                if (x < map_xy_x_min) {
                    map_xy_x_min = x;
                }
                if (y < map_xy_y_min) {
                    map_xy_y_min = y;
                }
            }
            // Compute sounds x, y position in the normalized space
            for (i in sounds) {
                var sound = sounds[i];
                x = Object.byString(sound, 'analysis.' + map_features[0]);
                y = Object.byString(sound, 'analysis.' + map_features[1]);
                sound.computed_x = (x - map_xy_x_min) / (map_xy_x_max - map_xy_x_min);
                sound.computed_y = 1 - (y - map_xy_y_min) / (map_xy_y_max - map_xy_y_min);
            }
        }
        all_loaded = true;
        console.log('Loaded map with ' + sounds.length + ' sounds')
    }
}

function checkSelectSound(x, y) {
    var min_dist = 9999;
    var selected_sound = false;
    for (i in sounds) {
        var sound = sounds[i];
        var dist = computeEuclideanDistance(sound.x, sound.y, x, y);
        if (dist < min_dist) {
            min_dist = dist;
            selected_sound = sound;
        }
    }

    if (min_dist < 0.01) {
        if (!selected_sound.selected) {
            selectSound(selected_sound);
        }
    }
}

function selectSound(selected_sound) {

    if (!selected_sound.selected) {
        selected_sound.selected = true;
        selected_sound.mod_amp = 5.0;
        if (MONO_MODE) {
            audio_manager.stopAllBufferNodes();
        }
        audio_manager.loadSound(selected_sound.id, selected_sound.preview_url);
        showSoundInfo(selected_sound);
        last_selected_sound_id = selected_sound['id']
    } else {
        selected_sound.selected = false;
        selected_sound.mod_amp = default_point_modulation;
    }
}

function finishPlayingSound(sound_id) {
    var sound = getSoundFromId(sound_id);
    sound.selected = false;
    sound.mod_amp = default_point_modulation;
}

function selectSoundFromId(sound_id) {
    var sound = getSoundFromId(sound_id);
    selectSound(sound);
}

function getSoundFromId(sound_id) {
    for (i in sounds) {
        var sound = sounds[i];
        if (sound.id == parseInt(sound_id)) {
            return sound;
        }
    }
}

function showSoundInfo(sound) {
    var html = '';
    if ((sound.image !== undefined) && (sound.image !== '')) {
        html += '<img src="' + sound.image + '"/ class="sound_image"><br>';
    }
    html += sound.name + ' by <a href="' + sound.url + '" target="_blank">' + sound.username + '</a>';
    document.getElementById('sound_info_box').innerHTML = html;
}

function setMapDescriptor() {
    // var selected_descriptors = document.getElementById('map_descriptors_selector').value;
    //
    // The following is used when querying Freesound to decide which descriptors to include in the response
    // if (selected_descriptors.startsWith("tsne&")) {
    //     map_type = "tsne";
    //     extra_descriptors = selected_descriptors.split('&')[1];
    //     map_features = [extra_descriptors];
    // } else if (selected_descriptors.startsWith("xy&")) {
    //     map_type = "xy";
    //     extra_descriptors = selected_descriptors.split('&')[1] + ',' + selected_descriptors.split('&')[2];
    //     map_features = [selected_descriptors.split('&')[1], selected_descriptors.split('&')[2]];
    // }  else {
    map_type = "xy";
    var x_descriptor = document.getElementById('x_axis_map_descriptors_selector').value;
    var y_descriptor = document.getElementById('y_axis_map_descriptors_selector').value;
    map_features = [x_descriptor, y_descriptor];

    // }
}

/* Drawing */

function draw() {
    ctx.clearRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'lighter';
    for (i in sounds) {
        var sound = sounds[i];
        var disp_x, disp_y;
        [disp_x, disp_y] = normCoordsToDisplayCoords(sound.x, sound.y)

        if (!sound.selected) {
            ctx.fillStyle = sound.rgba;
            ctx.strokeStyle = sound.rgba;
        } else {
            ctx.fillStyle = '#ffffff';
            ctx.strokeStyle = '#ffffff';
        }

        if (last_selected_sound_id == sound['id']) {
            ctx.fillStyle = '#ffffff';
        }

        ctx.beginPath();
        ctx.arc(disp_x, disp_y, sound.rad * zoom_factor * Math.pow(0.9, zoom_factor), 0, Math.PI * 2, true);
        ctx.fill();
        ctx.closePath();

        ctx.beginPath();
        ctx.arc(disp_x, disp_y, (sound.rad + 5 + (sound.mod_amp * Math.cos(sound.mod_position))) * zoom_factor * Math.pow(0.9, zoom_factor), 0, Math.PI * 2, true);
        ctx.stroke();
        ctx.closePath();

        sound.mod_position += sound.mod_inc;
    }
}

// form submit event handler
(function () {
    var formSubmitHandler = function formSubmitHandler(event) {
        event.preventDefault();
        start();
    }
    document.getElementById('query-form').onsubmit = formSubmitHandler;
})()

// axis text label drawing
function update_axis_labels() {
    if (map_type == "tsne") {
        nice_x_text = "Similarity";
        nice_y_text = "Similarity";
        document.getElementById('y_axis_box').innerHTML = "Similarity";
    } else {
        var nice_x_text = convert_to_nice_string(map_features[0])
        var nice_y_text = convert_to_nice_string(map_features[1])
    }

    // update the text boxes
    document.getElementById('x_axis_box').innerHTML = nice_x_text;
    document.getElementById('y_axis_box').innerHTML = nice_y_text;

}

// convert text in the form timbral.brightness to Brightness
function convert_to_nice_string(axis_string) {
    // convert to array at the dot
    var str = axis_string.split(".")
    // remove the timbral component
    var nice_str = str[1]
    // return the attribute with first letter as uppercase
    return nice_str.charAt(0).toUpperCase() + nice_str.slice(1);

}
