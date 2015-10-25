(function(){

angular.module('safemarket').service('utils',function(ticker,$q,$timeout){

	var utils = this

	function isAddr(string){
		try{
			return cryptocoin.convertHex.hexToBytes(string).length===20
		}catch(e){
			return false
		}
	}

	function isAliasAvailable(alias){
		return AliasReg.getAddr(alias) === utils.nullAddr
	}

	function getTypeOfAlias(alias){

		var addr = AliasReg.getAddr(alias)

		if(addr === utils.nullAddr)
			return null

		var runtimeBytecode = web3.eth.getCode(addr)

		if(runtimeBytecode === utils.runtimeBytecodes.Store)
			return 'store'

		if(runtimeBytecode === utils.runtimeBytecodes.Market)
			return 'market'

		return null
	}

	function validateAlias(alias,contractName){
		return validateAddr(AliasReg.getAddr(alias),contractName)
	}

	function validateAddr(addr,contractName){
		return web3.eth.getCode(addr)===utils.runtimeBytecodes[contractName]
	}
	

	function toAscii(string){
		var zeroChar = String.fromCharCode(0)
		return web3.toAscii(string).split(zeroChar).join('')
	}

	function getAlias(addr){
		return toAscii(AliasReg.getAlias(addr))
	}

	function convertObjectToHex(object){
		var objectBytes = msgpack.pack(object);
		return '0x'+cryptocoin.convertHex.bytesToHex(objectBytes)
	}

	function convertHexToObject(hex){
		try{
			var objectBytes = cryptocoin.convertHex.hexToBytes(hex)
			return msgpack.unpack(objectBytes)
		}catch(e){
			return null
		}
	}

	function convertCurrency(amount,currencies){

		console.log()

		var deferred = $q.defer()

		if(typeof amount!=='string')
			amount = amount.toString()

		
		check({
			amount:amount
			,from:currencies.from
			,to:currencies.to
		},{
			amount:{presence:true,type:'string',numericality:{}}
			,from:{presence:true,inclusion:Object.keys(ticker.rates),type:'string'}
			,to:{presence:true,inclusion:Object.keys(ticker.rates),type:'string'}
		})

		amount = 
			(new BigNumber(amount))
				.div(ticker.rates[currencies.from])
				.times(ticker.rates[currencies.to])

		return amount
	}

	function formatCurrency(amount,currency){
		if(!amount instanceof BigNumber)
			amount = new BigNumber(amount)

		if(currency === 'ETH')
			return amount.toFixed(4)
		else
			return amount.toFixed(2)
	}

	function convertCurrencyAndFormat(amount,currencies){
		return formatCurrency(
			convertCurrency(amount,currencies)
			,currencies.to
		)
	}


	function send(address,value){
		var deferred = $q.defer()
			,txHex = web3.eth.sendTransaction({
				to:address
				,value:value
			})

		waitForTx(txHex).then(function(){
			deferred.resolve()
		})

		return deferred.promise
	}

	function waitForTx(txHex, duration, pause){

		console.log('waitForTx',txHex)

		var deferred = $q.defer()
			,duration = duration ? duration : (1000*60)
			,pause = pause ? pause : (1000*3)
			,timeStart = Date.now()
			,interval = setInterval(function(){

				console.log('waiting...')

				var tx = web3.eth.getTransactionReceipt(txHex)

				if(tx){
					clearInterval(interval)
					deferred.resolve(tx)
					console.log(tx)
				}

				if(Date.now() - timeStart > duration){
					clearInterval(interval)
					deferred.reject('Transaction not found after '+duration+'ms')
				}

			},pause)

		return deferred.promise

	}

	function waitForTxs(txHexes){
		var deferred = $q.defer()
			,completedCount = 0

		if(txHexes.length === 0)
			$timeout(function(){
				deferred.reject('No transactions to wait for')
			},1)

		txHexes.forEach(function(txHex){
			waitForTx(txHex)
				.then(function(){
					completedCount++
					if(completedCount===txHexes.length)
						deferred.resolve()
				},function(error){
					deferred.reject(error)
				}).catch(function(error){
					deferred.reject(error)
				})
		})

		return deferred.promise
	}

	function check(data,constraints,prefix){

		if(!data)
			throw 'data is not an object'
			
		var dataKeys = Object.keys(data)
		    ,constraintKeys = Object.keys(constraints)

		constraintKeys.forEach(function(key){
			if(!constraints[key].type)
				throw key+' must be constrained by type'
		})

		dataKeys.forEach(function(key){
		    if(constraintKeys.indexOf(key)===-1)
			    delete data[key]
		})  

		var errors = validate(data,constraints)

		if(errors===undefined || errors===null)
			return null

		var error = errors[Object.keys(errors)[0]][0]

		error = prefix ? prefix+' '+error : error

	    throw error
	}

	angular.merge(this,{
		convertObjectToHex:convertObjectToHex
		,convertHexToObject:convertHexToObject
		,convertCurrency:convertCurrency
		,formatCurrency:formatCurrency
		,convertCurrencyAndFormat:convertCurrencyAndFormat
		,waitForTx:waitForTx
		,waitForTxs:waitForTxs
		,check:check
		,nullAddr:'0x'+Array(21).join('00')
		,isAddr:isAddr
		,getAlias:getAlias
		,toAscii:toAscii
		,isAliasAvailable:isAliasAvailable
		,send:send
		,getTypeOfAlias:getTypeOfAlias
		,runtimeBytecodes:{
			Store: '0x'+contractDB.Store.compiled.runtimeBytecode
			,Market: '0x'+contractDB.Market.compiled.runtimeBytecode
		},validateAddr:validateAddr
		,validateAlias:validateAlias
	})
	
})

})();