var express = require('express');
var OAuth = require('oauth').OAuth;
var formidable = require('formidable');

var fs = require('fs');
var apivendor = require('./apivendor.js');
var settings =  require('./settings.js');
var spec = require('./public_classic/js/spec.js');
var helper = require('./helper.js');
apivendor.config(settings.oauth_info);

files = ['public_classic', 'apivendor.js',
	 'daemon.js', 'helper.js',
	 'settings.js'];

function public_file(fn) {
    return __dirname + '/public_classic' + fn;
}

// Setup the Express.js server
var app = express.createServer();
app.use(express.bodyParser());
app.use(express.methodOverride());
app.use(express.logger());
app.use(express.bodyParser());
app.use(express.cookieParser());
app.use(express.session({
	    secret: "skjghskdjfhbqigohqdioukd"
		}));

var version = helper.get_last_modified.apply({}, files);
var dashboard_url = '/v/' + version;

app.get('/', apivendor.require_login, function(req, res){
	res.redirect(dashboard_url);
    });

function to_version(req, res, next) {
    if(req.params.version != '' + version) {
	res.redirect(dashboard_url);
    } else {
	next();
    }
}

app.get('/v/:version', to_version, apivendor.require_login, function(req, res) {
	res.sendfile(public_file('/dashboard/index.html'));
    });

app.use('/facebox', express.static(__dirname + '/facebox'));
app.use('/public', express.static(__dirname + '/public_classic'));

app.get('/app.manifest', function (req, res) {
	res.header('Content-Type: text/cache-manifest');
	res.sendfile(public_file('/app.manifest'));
    });

app.get('/logout', function (req, res) {
	apivendor.logout(req);
	res.redirect('/');
    });

app.get('/api_authorize', function (req, res) {
	var callback_url = 'http://' + req.headers.host + '/api_callback';
	apivendor.authorize(req, res, callback_url);
    });

app.get('/api_callback', function(req, res) {
	var api = apivendor.from_request(req);
	api.get_access_token(function(token, secret) {
		res.redirect(dashboard_url);
	    });
    });

app.get('/app_template/:ver.html', function(req, res) {
	res.sendfile(public_file('/dashboard/template.html'));
    });

app.get('/show_account', apivendor.require_login, function(req, res) {
	var api = apivendor.from_request(req);
	api.get('/account/verify_credentials',
		function(data) {
		    res.send(data);
		});
    });

app.get('/proxy/:section/:action', apivendor.require_login, function(req, res) {
	var path = '/' + req.params.section + '/' + req.params.action;	
	if(req.params.action == 'index') {
	    path = '/' + req.params.section;
	}
	var api = apivendor.from_request(req);
	delete req.query['_'];
	api.get(path, {
		'query': req.query,
		    'success': function (data) {
		    var sk = spec.encodeResult(path, data);
		    res.send(sk);
		},
		    'error': function (err) {
			console.info(err.data, {'Content-Type': 'application/json'}, err.statusCode);
			res.send(err.data, {'Content-Type': 'application/json'}, err.statusCode);
		    }
	    });
    });

app.post('/statuses/update', apivendor.require_login, function(req, res) {
	var form = new formidable.IncomingForm();
	form.parse(req, function(err, fields, files) {
		if(!files.photo || files.photo.size == 0) {
		    req.body = fields;
		    var api = apivendor.from_request(req);
		    api.post('/statuses/update', fields, {
			    'success': function (data) {
				res.header('Content-Type: application/json');
				res.send(data);
			    },
				'error': function (err) {
				    res.send(err.data, {'Content-Type': 'application/json'}, err.statusCode);
				}
			});
		} else { // Multipart
		    var api = apivendor.from_request(req);
		    helper.compose_multipart(fields, files, function (b, payload) {
			    api.post('/photos/upload', payload, {
				    'post_content_type': 'multipart/form-data; boundary=' + b,
					//'api_host': 'http://localhost:9090',
					'success': function (data) {
					res.header('Content-Type: application/json');
					res.send(data);
				    },
					'error': function (err) {
				    res.send(err.data, {'Content-Type': 'application/json'}, err.statusCode);
					}
				});
			});		    
		}
	    });	
    });

app.post('/proxy/:section/:action', apivendor.require_login, function(req, res) {
	var path = '/' + req.params.section + '/' + req.params.action;
	var api = apivendor.from_request(req);
	console.info('xxx', req.body);
	api.post(path, req.body, {
		'success': function (data) {
		    res.send(data);
		},
		    'error': function (err, data, resp) {
			res.send(err.data, 
				 //{'Content-Type': 'application/json'}, 
				 {'Content-Type': resp.headers['content-type'] || 'application/json'},
				 err.statusCode);
		    }
	    });
    });

app.get('/rconsole/:level', apivendor.require_login, function (req, res) {
	var log = console[req.params.level];
	if(log == undefined) {
	    log = console.log;
	}
	log('REMOTE', req.query.w);
	res.send('ok');
    });

app.listen(settings.daemon_port);
console.log("listening on http://localhost:" + settings.daemon_port);


