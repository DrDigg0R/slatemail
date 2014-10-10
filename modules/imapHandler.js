var Imap = require('imap');
var MailParser = require("mailparser").MailParser;
var Q = require('q');
var imap;
var fs = require('fs');

var imapHandler = {
	connect:function(){
		if(imap && imap.state && imap.state === 'authenticated'){
			return Q(true);
		}
		console.log('connecting...');
		var def = Q.defer();
		var conf = JSON.parse(fs.readFileSync('credentials/credentials2.json')).internal;
		// conf.debug = function(s){
		//   console.log(s);
		// };
		imap = new Imap(conf);
		imap.connect();
		imap
			.once('ready',function(){
				def.resolve();
			})
			.once('error',function(err){
				console.log('imap error: '+err);
			})
			.once('end', function() {
				console.log('Connection ended');
			});
		return def.promise;
	},
	connectAndOpen:function(box_name){
		// console.log('connecting and opening: '+box_name);
		var def = Q.defer();
		imapHandler.connect()
			.then(function(){
				return imapHandler.openBox(box_name);
			})
			.then(function(box){
				def.resolve(box);
				return true;
			})
			.catch(function(err){
				console.log(err);
			});
		return def.promise;
	},
	disconnect:function(){
		// console.log('disconnecting');
		imap.end();
	},
	openBox:function(box_name){
		var def = Q.defer();
		if(imap.opened_box === box_name){
			return Q(box_name);
		}
		console.log('opening box: '+box_name+'...');
		imap.openBox(box_name, false, function(err, box){
			if (err){
				console.log(err);
				throw err;
			}
			else{
				console.log('box opened');
				imap.opened_box = box_name;
				def.resolve(box);
			}
		});
		return def.promise;
	},
	getUIDsFlags:function(box_name){
		var def = Q.defer();
		imapHandler.connectAndOpen(box_name)
			.then(function(box){
				var message_identifiers = [];
				//var range_string = Math.max(1,(box.messages.total-Math.min(box.messages.total,50)))+':'+box.messages.total;
				var range_string = 1+':'+box.messages.total;
				var f = imap.seq.fetch(range_string)
					.on('message', function(msg, seqno) {
						var message_id;
						var uid;
						var flags;
						msg
							.once('attributes', function(attrs) {
								uid = attrs.uid;
								flags = (function(){
									var out = [];
									var flags = attrs.flags;
									for(var i in flags){
										if(flags.hasOwnProperty(i)){
											out.push(flags[i]);
										}
									}
									return out;
								}());
							})
							.once('end', function() {
								message_identifiers.push({
									uid:uid,
									flags:flags
								});
							});
					})
					.once('error', function(err) {})
					.once('end', function() {
						def.resolve(message_identifiers);
					});
			});
		return def.promise;
	},
	getMessageWithUID:function(box_name, uid){
		// console.log('getting message with uid: '+uid);
		var def = Q.defer();
		var message;
		imapHandler.getMessagesWithSearchCriteria({
			box_name:box_name,
			criteria:[['UID',parseInt(uid,10)]],
			callback_on_message:function(mail_obj){
				def.resolve(mail_obj);
				throw new Error('abort promise chain');
			}
		})
		.then(function(){
			def.resolve(false);
		})
		.fail(function(err){
			def.resolve(false);
		});
		return def.promise;
	},
	getMessagesWithSearchCriteria:function(conf){
		// console.log('ImapHandler: Get messages with search criteria: '+conf.criteria);
		var def = Q.defer();
		imapHandler.connectAndOpen(conf.box_name)
			.then(function(box){
				imap.search(conf.criteria, function(err,results){
					// console.log('search initiated');
					if(err || !results || results.length === 0){
						// console.log('no results found');
						if(conf.callback_on_end){
							conf.callback_on_end(false);
						}
						return;
					}
					var fetch = imap.fetch(results,{ bodies: '' });
					fetch.on('message', function(msg) {
						imapHandler.getMailObject(msg)
							.then(function(mail_object){
								if(conf.callback_on_message){
									conf.callback_on_message(mail_object);
								}
							});
					});
					fetch.once('error', function(err) {
						console.log(err);
						def.resolve();
					});
					fetch.once('end',function(){
						def.resolve();
					});
				});
			})
			.catch(function(err){
				console.log(err);
			});
		return def.promise;
	},
	getMailObject: function(msg){
		var def = Q.defer();
		var parser = new MailParser();
		parser.on('end', function(mail_object){
			def.resolve(mail_object);
		});
		msg.on('body', function(stream, info) {
			stream.pipe(parser);
		});
		return def.promise;
	},
	markSeen:function(box_name, uid, callback){
		console.log('marking seen: '+uid);
		var def = Q.defer();
		imapHandler.connectAndOpen(box_name)
			.then(function(box){
				imap.addFlags(uid,['Seen'],function(err){
					def.resolve();
				});
			});
		return def.promise;
	},
	getBoxes:function(callback){
		var def = Q.defer();
		imapHandler.connect()
			.then(function(){
				imap.getBoxes(function(err, boxes){
					def.resolve(boxes);
				});
			});
		return def.promise;
	},
	getMessageCount:function(box_name, callback){
		var deferred = Q.defer();
		imapHandler.connectAndOpen(box_name)
			.then(function(box){
				return deferred.resolve(box.messages.total);
			});
		return deferred.promise;
	},
	ensureBox:function(box_name){
		var def = Q.defer();
		imapHandler.getBoxes()
			.then(function(boxes){
				console.log(boxes);
				if(boxes[box_name]){
					console.log('box already exists; ensured.');
					def.resolve();
					return true;
				}
				else{
					console.log('box does not exist; creating');
					return imapHandler.createBox(box_name);
				}
			})
			.fin(function(){
				console.log('box ensured');
				def.resolve();
			});
		return def.promise;
	},
	createBox:function(box_name){
		var def = Q.defer();
		imap.addBox(box_name, function(){
			def.resolve();
		});
		return def.promise;
	},
	move:function(from_box, to_box, uid, callback){
		console.log('moving '+from_box+':'+uid+' to '+to_box);
		var def = Q.defer();
		imapHandler.ensureBox(to_box)
			.then(function(){
				return imapHandler.connectAndOpen(from_box);
			})
			.then(function(){
				imap.move(uid, to_box, function(){
					return true;
				});
			})
			.catch(function(err){
				console.log(err);
			})
			.fin(function(){
				console.log('move complete');
				def.resolve();
			});
//		imapHandler.connectAndOpen(from_box)
//			.then(function(){
//				imap.move(uid, to_box, function(){
//					def.resolve();
//				});
//			})
		return def.promise;
	}
};

module.exports = imapHandler;
