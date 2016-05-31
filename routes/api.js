/*
 * Serve JSON to our AngularJS client
 */
var express     = require('express');
var https       = require('https');
var q           = require('q');
var api         = express.Router();
var db          = require('../config/db').connection;

var async = require('async');
var DOMParser = require('xmldom').DOMParser;

var apiUrlBase = 'https://www.alphashirt.com/cgi-bin/online/xml/inv-request.w?';
var apiUrlInformation = '&pr=y&zp=10002&userName=triggered1111&password=triggered2222';

// API endpoint for /api/apparel
api.get('/api/apparel/:styleCode?', function(req, res) {
	// Insert Apparel API code here
	if( !req.params.styleCode){
		return res.send(422, 'Missing Style Code');
	}

	var styleCode = JSON.stringify(req.params.styleCode);

	var selectStatment = 'SELECT * FROM apparel where style_code = ' + styleCode;
	db.query(selectStatment, function(err, rows) {
		if (err){
			return res.send(500, err.message);
		}

		if (rows.length === 0) {
			return res.send(422, 'Invalid Style Code');
		}

		var colorObj = rows[0].color_codes.split(';');
		var color = [];
		colorObj.forEach(function(entry) {
			var obj = entry.split(':');
			color.push(obj[2]);
		});

		var sizeObj = rows[0].size_codes.split(';');
		var size = [];
		sizeObj.forEach(function(entry) {
			var obj = entry.split(':');
			size.push(obj[1]);
		});
		res.send(200, {size:size, color:color});
	});
});

api.get('/api/brandNames', function(req, res) {
	db.query('SELECT * FROM apparel', function(err, rows) {
		if (err) {
			return res.send(500, err.message);
		}
		var apparels = {};
		rows.forEach(function(entry) {
			apparels[entry.brand] = entry.style_code;
		});
		res.send(200, apparels);
	});
});



// API endpoint for /api/quote
api.post('/api/quote', function(req, res) {

	// Insert Quoting API code here
	var amount = req.body.amount;
	var styleCode = req.body.styleCode;

	var colorCode;
	var sizeCode;
	var weight;

	var total;
	var pricePerItem;

	var errCode;

	async.series([
		function(cb) {
			if (!styleCode) {
				errCode = 422;
				return cb('Style Code is Missing');
			}
			if (!req.body.color) {
				errCode = 422;
				return cb('Color is Missing');
			}
			if (!req.body.size) {
				errCode = 422;
				return cb('Size is Missing');
			}
			if (!amount) {
				errCode = 422;
				return cb('amount is Missing');
			}
			if (!parseInt(amount)) {
				errCode = 422;
				return cb('amount needs to be an integer that is greater than 0');
			}else if (amount <= 0) {
				errCode = 422;
				return cb('amount needs to be an integer that is greater than 0');
			}
			cb();
		},
		function(cb) {
			var selectStatement = 'SELECT * FROM apparel where style_code = ' + JSON.stringify(styleCode);
			db.query(selectStatement, function(err, rows) {
				if (err) {
					errCode = 500;
					return cb(err);
				}

				if (rows.length === 0) {
					errCode = 404;
					return cb('Style Code Not Found');
				}

				var sizeObj = rows[0].size_codes.split(';');
				sizeObj.forEach(function(entry) {
					var obj = entry.split(':');
					if ( obj[1] === req.body.size.toUpperCase()) {
						sizeCode = obj[0];
					}
				});
				if (!sizeCode) {
					errCode = 404;
					return cb('Size Not Found');
				}

				var colorObj = rows[0].color_codes.split(';');
				colorObj.forEach(function(entry) {
					var obj = entry.split(':');
					if ( obj[2] === req.body.color.toUpperCase()) {
						colorCode = obj[0]
					}
				});
				if (!colorCode) {
					errCode = 404;
					return cb('Color Not Found');
				}

				weight = rows[0].weight;
				cb();
			});
		},
		function(cb) {
			var promise= getApparelPrice(styleCode, colorCode, sizeCode);
			promise.then(function(price) {

				total = amount*price;
				console.log('Price of all items: $', total);

				if (weight <= 0.4 && amount < 48) {
					total = total + 1.0 * amount;
				}else if (weight <= 0.4 && amount >= 48){
					total = total + 0.75 * amount;
				}else if (weight > 0.4 && amount < 48) {
					total = total + 0.5 * amount;
				}else if (weight > 0.4 && amount >= 48) {
					total = total + 0.25 * amount;
				}
				console.log('Price after shipping: $', total);

				total = total * 1.07;
				console.log('Price after salesman compensation: $', total);

				if (total <= 800 ){
					total = total * 1.5;
				}else {
					total = total * 1.45;
				}
				pricePerItem = total/amount;
				total = total.toFixed(2);
				pricePerItem = pricePerItem.toFixed(2);
				console.log('Price after mark up: $', total);
				console.log('Price per Item after mark up: $', pricePerItem);
				cb();
			}, function(reason) {
				errCode = 500;
				cb(reason);
			})
		}
	], function(err) {
		if (err) {
			return res.send(errCode, err);
		}
		res.send(200, {quote: total, price: pricePerItem});
	})
});


// Function for making an Inventory API call
var getApparelPrice = function getPrice(style_code, color_code, size_code) {
	var	apparelPriceDeferred = q.defer();

	var params = 'sr=' + style_code + '&cc=' + color_code + '&sc=' + size_code;
	// Format the Inventory API endpoint as explained in the documentation
	https.get(apiUrlBase + params + apiUrlInformation, function(res) {
		res.on('data', function (data) {
			// Parse response XML data here
			var normalData = new Buffer(data, 'base64');
			var normalString = normalData.toString();
			var xmlDoc =  new DOMParser().parseFromString(normalString,'text/xml');

			if(!xmlDoc.getElementsByTagName("item")){
				return apparelPriceDeferred.reject('Error Finding Price');
			}
			var element = xmlDoc.getElementsByTagName("item")[0];
			if (!element) {
				return apparelPriceDeferred.reject('Error Finding Price');
			}
			var price = element.getAttribute('price');
			if (!price) {
				return apparelPriceDeferred.reject('Error Finding Price');
			}
			price = price.replace('$', '');
			var priceFloat = parseFloat(price);
			if (!priceFloat) {
				return apparelPriceDeferred.reject('Error Finding Price');
			}
			apparelPriceDeferred.resolve(priceFloat);
		});
	}).on('error', function(error) {
		// Handle EDI call errors here
		apparelPriceDeferred.reject('Error Finding Price');
	});
	return apparelPriceDeferred.promise;
};

module.exports = api;