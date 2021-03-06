/* globals angular, contracts, web3 */

angular.module('app').factory('Store', ($q, utils, ticker, Key, txMonitor, AliasReg, StoreReg, Infosphered, Meta, user, Coinage, constants) => {

  function Store(addrOrAlias) {
    this.addr = utils.isAddr(addrOrAlias) ? addrOrAlias : AliasReg.getAddr(addrOrAlias)
    this.alias = utils.getAlias(this.addr)
    this.contract = this.contractFactory.at(this.addr)
    this.meta = new Meta(this.contract)
    this.infosphered = new Infosphered(this.contract, {
      isOpen: 'bool',
      currency: 'bytes32',
      disputeSeconds: 'uint',
      minTotal: 'uint',
      affiliateFeeCentiperun: 'uint'
    })
    this.updatePromise = this.update()
  }

  Store.prototype.bytecode = Store.bytecode = contracts.Store.bytecode
  Store.prototype.runtimeBytecode = Store.runtimeBytecode = utils.runtimeBytecodes.Store
  Store.prototype.abi = Store.abi = contracts.Store.abi
  Store.prototype.contractFactory = Store.contractFactory = web3.eth.contract(Store.abi)

  Store.create = function createStore(isOpen, currency, disputeSeconds, minTotal, affiliateFeeCentiperun, meta, alias) {

    meta = utils.convertObjectToHex(meta)
    const deferred = $q.defer()

    txMonitor.propose(
      'Create a New Store',
      StoreReg.create,
      [isOpen, currency, disputeSeconds, minTotal, affiliateFeeCentiperun, meta, alias]
    ).then((txReciept) => {
      const contractAddress = utils.getContractAddressFromTxReceipt(txReciept)
      deferred.resolve(new Store(contractAddress))
    })

    return deferred.promise
  }

  Store.prototype.set = function setStore(infospheredData, metaData) {

    const deferred = $q.defer()
    const infospheredCalls = this.infosphered.getMartyrCalls(infospheredData)
    const metaCalls = this.meta.getMartyrCalls(metaData)
    const allCalls = infospheredCalls.concat(metaCalls)
    const data = utils.getMartyrData(allCalls)

    txMonitor.propose('Update Store', web3.eth.sendTransaction, [{
      data: data,
      gas: web3.eth.estimateGas({ data: data }) * 4
    }]).then((txReciept) => {
      deferred.resolve(txReciept)
    }, (err) => {
      deferred.reject(err)
    })

    return deferred.promise
  }

  Store.check = function checkStore(alias, meta) {

    utils.check({ alias: alias }, {
      alias: {
        presence: true,
        type: 'alias'
      }
    })

    utils.check(meta, {
      name: {
        presence: true,
        type: 'string'
      }, products: {
        exists: true,
        type: 'array'
      }, info: {
        type: 'string'
      }, submarketAddrs: {
        exists: true,
        type: 'array'
      }, transports: {
        presence: true,
        type: 'array',
        length: { minimum: 1 }
      }
    })

    meta.submarketAddrs.forEach((submarketAddr) => {
      utils.check({
        addr: submarketAddr
      }, {
        addr: {
          presence: true,
          type: 'address',
          addrOfContract: 'Submarket'
        }
      }, 'Submarket')
    })

    meta.products.forEach((product) => {
      utils.check(product, {
        id: {
          presence: true,
          type: 'string',
          numericality: {
            integerOnly: true,
            greaterThanOrEqualTo: 0
          }
        }, name: {
          presence: true,
          type: 'string'
        }, price: {
          presence: true,
          type: 'string',
          numericality: {
            greaterThan: 0
          }
        }, info: {
          type: 'string'
        }, imageUrl: {
          type: 'url'
        }
      }, 'Product')
    })

    meta.transports.forEach((transport) => {
      utils.check(transport, {
        id: {
          presence: true,
          type: 'string',
          numericality: {
            integerOnly: true,
            greaterThanOrEqualTo: 0
          }
        }, type: {
          presence: true,
          type: 'string'
        }, price: {
          presence: true,
          type: 'string',
          numericality: {
            greaterThanOrEqualTo: 0
          }
        }
      }, 'Transport')
    })
  }

  Store.estimateCreationGas = function estimateStoreCreationGas(alias, meta) {
    meta = typeof meta === 'string' ? meta : utils.convertObjectToHex(meta)

    return this.contractFactory.estimateGas(alias, meta, AliasReg.address, {
      data: Store.bytecode
    }) + AliasReg.claimAlias.estimateGas(alias)
  }


  Store.prototype.update = function updateStore() {

    const deferred = $q.defer()
    const store = this

    this.products = []
    this.transports = []
    this.reviews = []
    this.scoreCounts = []
    this.scoreCountsReversed = []
    this.scoreCountsSum = 0
    this.scoreCountsTotal = 0
    this.owner = this.contract.owner()
    this.key = new Key(this.owner)

    this.infosphered.update()

    this.currency = utils.toAscii(this.infosphered.data.currency)
    this.minTotal = new Coinage(this.infosphered.data.minTotal.div(constants.tera), this.currency)

    this.meta.update().then((meta) => {

      store.info = utils.sanitize(meta.data.info || '')

      if (meta.data.products) {
        meta.data.products.forEach((data) => {
          store.products.push(new Product(data, store.currency))
        })
      }

      if (meta.data.transports) {
        meta.data.transports.forEach((data) => {
          store.transports.push(new Transport(data, store.currency))
        })
      }

      deferred.resolve(store)
    })

    return deferred.promise
  }

  function Review(result, store) {
    this.data = utils.convertHexToObject(result.args.data)
    this.orderAddr = result.args.orderAddr

    const reviewData = store.contract.getReview(result.args.orderAddr)
    this.score = reviewData[0].toNumber()
    this.timestamp = reviewData[1].toNumber()
  }

  function Product(data, currency) {
    this.id = data.id
    this.name = data.name
    this.price = new Coinage(data.price, currency)
    this.info = data.info
    this.imageUrl = data.imageUrl
    this.quantity = 0
  }

  function Transport(data, currency) {
    const userCurrency = user.getCurrency()

    this.id = data.id
    this.data = data
    this.price = new Coinage(this.data.price, currency)

    const priceFormatted = utils.formatCurrency(this.price.in(userCurrency), userCurrency, 1)
    this.label = `${this.data.type} (${priceFormatted})`
  }

  return Store

})
