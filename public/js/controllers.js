'use strict';
var http = require('http');
/* Controller */
angular.module('myApp', []).
	controller('AppCtrl', function ($scope, $http) {
	// Insert controller code here
	$scope.data = '4';
	//http.get('/api/brandNames', function (res) {
	//	res.on('data', function (data) {
	//		// Parse response XML data here
	//		$scope.data = data;
	//	});
	//}).on('error', function (error) {
	//	// Handle EDI call errors here
	//	$scope.error = 'data could not be loaded'
	//});
});