import * as mysql from 'mysql'
import { configPath, getConfig } from '@red5/server'
import { QueryInfo } from '.'
import { Model } from './Model';

export declare type DBValue = string | number | DBRaw
export declare type DBComp = '=' | '<' | '>' | '>=' | '<=' | '!=' | '<>'
export declare type DBSort = 'asc' | 'desc'
export declare type DBWhereType = 'and' | 'or'
export declare type DBWhereMatchAgainst = 'natural' | 'boolean' | 'expansion'
export declare type RowDataPacket = mysql.Query['RowDataPacket']
export interface DBPaginate {
  /**
   * The results for the current page
   *
   * @type {any[]}
   * @memberof DBPaginate
   */
  results: any[]
  /**
   * The number of results for the current page
   *
   * @type {number}
   * @memberof DBPaginate
   */
  count: number
  /**
   * The total number of results for all pages
   *
   * @type {number}
   * @memberof DBPaginate
   */
  total: number
  /**
   * The total number of pages
   *
   * @type {number}
   * @memberof DBPaginate
   */
  pages: number
  /**
   * The actual current page number
   *
   * @type {number}
   * @memberof DBPaginate
   */
  page: number
  /**
   * The current starting offset of the result set (zero based)
   *
   * @type {number}
   * @memberof DBPaginate
   */
  offset: number
  /**
   * The start position and end position of the current result set (non-zero based)
   *
   * @type {{ start: number, end: number }}
   * @memberof DBPaginate
   */
  range: {
    /**
     * The starting position
     *
     * @type {number}
     */
    start: number,
    /**
     * The ending position
     *
     * @type {number}
     */
    end: number
  }
  /**
   * A test of whether or not this is the last page in the result set
   *
   * @type {boolean}
   * @memberof DBPaginate
   */
  lastPage: boolean
  /**
   * A test of whether or not this is the first page in the result set
   *
   * @type {boolean}
   * @memberof DBPaginate
   */
  firstPage: boolean
}

export interface DBConnectionSettings {
  default?: boolean
  driver: string
  database: string
  username: string
  password: string
  hostname: string
  port?: number
}

export interface DBSettings {
  [key: string]: DBConnectionSettings
}

export interface DBPool {
  name: string
  pool: mysql.Pool
}

export class DBKeyVal {
  public constructor(
    public readonly column: string,
    public readonly comp: DBComp,
    public readonly value: DBValue,
    public readonly type: DBWhereType = 'and'
  ) { }
}

export class DBRaw {
  public constructor(
    public readonly value: string,
    public readonly replacements: any[] = [],
    public readonly type: DBWhereType = 'and'
  ) { }
}

export class DBBetween {
  public constructor(
    public readonly column: string,
    public readonly value1: any,
    public readonly value2: any,
    public readonly not: boolean,
    public readonly type: DBWhereType = 'and'
  ) { }
}

export class DBIn {
  public constructor(
    public readonly column: string,
    public readonly items: any[],
    public readonly not: boolean,
    public readonly type: DBWhereType = 'and'
  ) { }
}

export class DBMatchAgainst {
  public constructor(
    public readonly columns: string[],
    public readonly search: string,
    public readonly modifier: DBWhereMatchAgainst = 'natural',
    public readonly alias: string = '',
    public readonly type: DBWhereType = 'and'
  ) { }
}

export class DBNull {
  public constructor(
    public readonly column: string,
    public readonly not: boolean,
    public readonly type: DBWhereType = 'and'
  ) { }
}

export class DB {
  private static _connectionPools: DBPool[] = []
  private static _configuration?: DBSettings

  private _connection?: mysql.PoolConnection
  private _pool?: mysql.Pool
  private _connName?: string

  private readonly _queryInfo: QueryInfo

  private _isTransaction: boolean = false

  /**
   * DB should not be instantiated outside of itself.
   */
  protected constructor() {
    this._queryInfo = new QueryInfo
  }

  public static table(name: string) {
    let db = new DB
    db._queryInfo.table = name
    return db
  }

  public static connect(name: string, table = '') {
    let db = new DB
    db.table(table)
    db._connName = name
    return db
  }

  protected async _connect(name: string | undefined) {
    return new Promise<boolean>(resolve => {
      // Get the configurations from file if it hasn't been read yet
      if (!DB._configuration) DB._configuration = getConfig<DBSettings>('db')
      if (!DB._configuration) throw new Error(`Could not find the database configuration at "${configPath('db.js')}"`)

      // Find the requested configuration within the configurations
      let entries = Object.entries(DB._configuration)
      if (entries.filter(i => i[1].driver == 'mysql' && i[1].default).length > 1) throw new Error(`Too many default connections for the MySQL driver`)
      let [alias, db] = entries.find(e => {
        let key = e[0], value = e[1], n = (name || '').trim().length
        if (n > 0 && key == name) return true
        if (n == 0 && value.default === true && value.driver.toLowerCase() == 'mysql') return true
        return false
      }) || [null, null]

      // Attempt to find a pool in the connection pools if there isn't a reference set
      if (!this._pool) {
        let pool = DB._connectionPools.find(i => i.name == alias)
        if (pool) {
          this._pool = pool.pool
          return resolve(true)
        }
      }

      // If a pool still hasn't been found create a new pool
      if (db && alias && !this._pool) {
        // if (this._pool) return resolve(true)
        let pool = mysql.createPool({
          host: db.hostname,
          user: db.username,
          password: db.password,
          database: db.database,
          port: db.port || 3306
        })
        this._pool = pool
        DB._connectionPools.push({ name: <string>alias, pool })
        resolve(true)
      } else {
        resolve(true)
      }
    })
  }

  private _getConnection() {
    return new Promise<mysql.PoolConnection>(async resolve => {
      await this._connect(this._connName)
      if (!this._pool) throw new Error(`No MySQL connection found for "${this._connName}"`)
      this._pool.getConnection((err, connection) => {
        if (err) throw err
        this._connection = connection
        resolve(connection)
      })
    })
  }

  //////////////////////////////////////////////////////////////////////////////
  /// Begin: Methods that transform queries
  //////////////////////////////////////////////////////////////////////////////

  /**
   * Set the name of the table to search
   *
   * @param {string} name
   * @returns
   * @memberof DB
   */
  public table(name: string) {
    this._queryInfo.table = name
    return this
  }

  /**
   * The maximum number of results to return
   *
   * @param {(number | undefined)} limit
   * @returns
   * @memberof DB
   */
  public limit(limit: number | undefined) {
    this._queryInfo.limit = parseInt((limit || 0).toString()) || undefined
    return this
  }

  /**
   * The starting query offset
   *
   * @param {(number | undefined)} offset
   * @returns
   * @memberof DB
   */
  public offset(offset: number | undefined) {
    this._queryInfo.offset = parseInt((offset || 0).toString()) || undefined
    return this
  }

  /**
   * Adds an order to order by a specific column in ascending or descending order.
   * * Items are sorted in the order that they are added.
   *
   * @param {string} column
   * @param {DBSort} [sort='asc']
   * @returns
   * @memberof DB
   */
  public orderBy(column: string, sort: DBSort = 'asc') {
    this._queryInfo.addOrderBy({ column, sort })
    return this
  }

  /**
   * Overwrites the current order by with new values.
   * * Items are sorted in the order that they are added.
   * * Passing no parameters removes the sort completely.
   *
   * @param {...{ column: string, sort: DBSort }[]} value
   * @returns
   * @memberof DB
   */
  public setOrderBy(...value: { column: string, sort: DBSort }[]) {
    this._queryInfo.orderBy = []
    this._queryInfo.addOrderBy(...value)
    return this
  }

  /**
   * Adds a group for a specific column in ascending or descending order
   * * Items are grouped in the order that they are added.
   *
   * @param {string} column
   * @param {DBSort} [sort='asc']
   * @returns
   * @memberof DB
   */
  public groupBy(column: string, sort: DBSort = 'asc') {
    this._queryInfo.groupBy.push({ column, sort })
    return this
  }


  /**
   * Overwrites the current group by with new values.
   * * Items are grouped in the order that they are added.
   * * Passing no parameters removes the group completely.
   *
   * @param {...{ column: string, sort: DBSort }[]} value
   * @returns
   * @memberof DB
   */
  public setGroupBy(...value: { column: string, sort: DBSort }[]) {
    this._queryInfo.groupBy = []
    this._queryInfo.groupBy.push(...value)
    return this
  }

  /**
   * Only selects distinct rows for the result
   *
   * @returns
   * @memberof DB
   */
  public distinct() {
    this._queryInfo.distinct = true
    return this
  }

  /**
   * The columns to add to the current select statement
   *
   * @param {(...(string | DBRaw)[])} columns The columns to select
   * @returns
   * @memberof DB
   */
  public select(...columns: (string | DBRaw)[]) {
    this._queryInfo.addSelect(...columns)
    return this
  }

  /**
   * Clears the current select statement and resets it with these columns
   *
   * @param {(...(string | DBRaw)[])} columns The columns to set as the select
   * @returns
   * @memberof DB
   */
  public setSelect(...columns: (string | DBRaw | DBMatchAgainst)[]) {
    this._queryInfo.select = columns
    return this
  }

  /**
   * A match against select statement to generate a score.
   * * Add an `orderBy('score', 'desc')` (where `score` is the alias name) to order by this column.
   *
   * @param {string[]} columns The columns to match (Requires full-text indexes)
   * @param {string} search The text string to search within the columns
   * @param {string} [alias='score'] The alias of the score column defaults to 'score'
   * @returns
   * @memberof DB
   */
  public selectMatchAgainst(columns: string[], search: string, alias: string = 'score') {
    this._queryInfo.addSelect(new DBMatchAgainst(columns, search, 'boolean', alias))
    return this
  }

  public where(column: string, comp: DBComp, value: DBValue): DB
  public where(column: string, value: DBValue): DB
  public where(raw: DBRaw): DB
  public where(...args: any[]): DB {
    if (args[0] instanceof DBRaw) {
      this._queryInfo.addWhere(args[0])
    } else {
      this._addFilter('where', 'and', ...args)
    }
    return this
  }

  public orWhere(column: string, comp: DBComp, value: DBValue): DB
  public orWhere(column: string, value: DBValue): DB
  public orWhere(...args: any[]): DB {
    this._addFilter('where', 'or', ...args)
    return this
  }

  public whereIn(column: string, items: any[]) {
    this._queryInfo.addWhere(new DBIn(column, items, false, 'and'))
    // this._addWhere()'and', column, items)
    return this
  }

  public whereNotIn(column: string, items: any[]) {
    this._queryInfo.addWhere(new DBIn(column, items, true, 'and'))
    // this._addWhere()'and', column, items)
    return this
  }

  public whereBetween(column: string, value1: any, value2: any, type: DBWhereType = 'and') {
    this._queryInfo.addWhere(new DBBetween(column, value1, value2, false, type))
    return this
  }

  public whereNotBetween(column: string, value1: any, value2: any, type: DBWhereType = 'and') {
    this._queryInfo.addWhere(new DBBetween(column, value1, value2, true, type))
    return this
  }

  public whereNull(column: string) {
    this._queryInfo.addWhere(new DBNull(column, false))
    return this
  }

  public whereNotNull(column: string) {
    this._queryInfo.addWhere(new DBNull(column, true))
    return this
  }

  /**
   * Match against where statement to run a full-text search
   *
   * @param {string[]} columns The columns to match (Requires full-text indexes)
   * @param {string} search The text string to search within the columns
   * @param {DBWhereMatchAgainst} modifier The type of search (natural, boolean, query expansion)
   * @returns
   * @memberof DB
   */
  public whereMatchAgainst(columns: string[], search: string, modifier: DBWhereMatchAgainst = 'natural') {
    this._queryInfo.addWhere(new DBMatchAgainst(columns, search, modifier))
    return this
  }

  public having(column: string, comp: DBComp, value: DBValue): DB
  public having(column: string, value: DBValue): DB
  public having(raw: DBRaw): DB
  public having(...args: any[]): DB {
    if (args[0] instanceof DBRaw) {
      this._queryInfo.addHaving(args[0])
    } else {
      this._addFilter('having', 'and', ...args)
    }
    return this
  }

  public orHaving(column: string, comp: DBComp, value: DBValue): DB
  public orHaving(column: string, value: DBValue): DB
  public orHaving(raw: DBRaw): DB
  public orHaving(...args: any[]): DB {
    this._addFilter('having', 'or', ...args)
    return this
  }

  private _addFilter(addTo: 'where' | 'having', ...args: any[]) {
    let type = args[0], column = args[1], comp: DBComp = '=', value = ''

    if (args.length == 4) {
      comp = args[2]
      value = args[3]
    } else if (args.length == 3) {
      value = args[2]
    }
    if (addTo == 'where') this._queryInfo.addWhere(new DBKeyVal(column, comp, value, type))
    else if (addTo == 'having') this._queryInfo.addHaving(new DBKeyVal(column, comp, value, type))
    return this
  }

  //////////////////////////////////////////////////////////////////////////////
  /// End: Methods that transform queries
  //////////////////////////////////////////////////////////////////////////////
  //////////////////////////////////////////////////////////////////////////////
  /// Begin: Methods that initiate and run queries
  //////////////////////////////////////////////////////////////////////////////

  /**
   * Execute any mysql query (select, update, delete, insert, etc.)
   *
   * @param {string} query The query string to execute
   * @param {...any[]} replacements Placeholder values to replace: `??` for fields; `?` for values
   * @returns
   * @memberof DB
   */
  public async query(query: string, ...replacements: any[]): Promise<RowDataPacket[]> {
    return new Promise<RowDataPacket[]>(async resolve => {
      let connection = !this._connection ? await this._getConnection() : this._connection
      if (!connection) throw new Error('Cannot query without a connection')
      console.log(query, '=>', replacements)
      connection.query(query, replacements, (error, results: RowDataPacket[]) => {
        if (!this._isTransaction) connection.release()
        if (error) throw error
        resolve(results)
      })
    })
  }

  public static async query(query: string, ...replacements: any[]) {
    return await new DB().query(query, ...replacements)
  }

  public static async insert(query: string, ...replacements: any[]): Promise<boolean> {
    try {
      await new DB().query(query, ...replacements)
      return true
    } catch (e) {
      return false
    }
  }

  /**
   * Connects to the database if no connection is found then executes the query
   *
   * @param {string} [query=''] An optional query (passing this value ignores the query builder)
   * @returns
   * @memberof DB
   */
  public async get(): Promise<RowDataPacket[]> {
    let query = this._queryInfo.query
    return await this.query(query, ...this._queryInfo.placeholders)
  }

  /**
   * Begins a database transaction.
   * If commit is not called, it will automatically get called after the callback.
   *
   * @static
   * @param {(connection: DB) => void} callback The transaction to execute
   * @memberof DB
   * @returns {Promise<void>}
   */
  public static async transaction(callback: (db: DB) => void): Promise<void> {
    let db = new DB
    // Get a connection
    let connection = await db._getConnection()
    db._isTransaction = true
    return new Promise<void>(resolve => {
      // Begin the transaction
      connection.beginTransaction(async () => {
        await callback(db)
        await db.commit()
        db._isTransaction = false
        connection.release()
        resolve()
      })
    })
  }

  /**
   * Commits the transaction to the database.
   * If there is an error committing the transaction, then the transaction will be rolled back.
   *
   * @returns {Promise<void>}
   * @memberof DB
   */
  public async commit(): Promise<void> {
    return new Promise<void>(resolve => {
      if (!this._isTransaction) throw new Error('Cannot commit because a database transaction has not been started')
      if (!this._connection) throw new Error('Cannot commit without a connection')
      this._connection.commit(async err => {
        if (err) await this.rollback()
        resolve()
      })
    })
  }

  /**
   * Rolls back the database transaction.
   *
   * @returns
   * @memberof DB
   * @returns {Promise<void>}
   */
  public async rollback(): Promise<void> {
    return new Promise<void>(resolve => {
      if (!this._isTransaction) throw new Error('Cannot rollback because a database transaction has not been started')
      if (!this._connection) throw new Error('Cannot rollback without a connection')
      this._connection.rollback(() => resolve())
    })
  }

  /**
   * Streams the results in chunks.
   *
   * @param {number} rows The maximum number of rows per chunk
   * @param {(rows: any[]) => void} callback A callback to run on each chunk
   * @returns {Promise<void>}
   * @memberof DB
   */
  public async chunk(rows: number, callback: (rows: any[]) => void): Promise<void>
  /**
   * Streams the results in chunks of 10.
   *
   * @param {(rows: any[]) => void} callback A callback to run on each chunk
   * @returns {Promise<void>}
   * @memberof DB
   */
  public async chunk(callback: (rows: any[]) => void): Promise<void>
  public async chunk(...args: (number | Function)[]): Promise<void> {
    let callback = (args.length == 2 ? args[1] : args[0]) as Function
    let rows = (args.length == 2 ? args[0] : 10) as number
    let query = this._queryInfo.query
    console.log(query, '=>', this._queryInfo.placeholders)
    return new Promise<void>(async resolve => {
      let connection = await this._getConnection()
      let resultRows: any[] = []
      // Send the results to the client
      async function sendResults() {
        connection.pause()
        await callback(resultRows)
        resultRows = []
        connection.resume()
      }
      // Execute the query
      connection.query(query, this._queryInfo.placeholders)
        // Build the result array and send it when the array is long enough
        .on('result', async (row: any) => {
          resultRows.push(row)
          resultRows.length == rows && await sendResults()
        })
        // Send the result array if we never got to the full length and there is no more results
        .on('end', async () => {
          resultRows.length > 0 && await sendResults()
          resolve()
        })
    })
  }

  /**
   * Gets the first row in the result set
   *
   * @returns {Promise<RowDataPacket>}
   * @memberof DB
   */
  public async first(): Promise<RowDataPacket | null> {
    let s = this._queryInfo.limit, sl = this._queryInfo.offset
    let rows = await this.limit(1).offset(0).get()
    if (rows.length == 0) return null
    this.limit(s).offset(sl)
    return rows[0]
  }

  /**
   * Executes a stored procedure.
   *
   * @static
   * @param {string} name The name of the stored procedure
   * @param {...any[]} args The arguments passed to the stored procedure
   * @returns
   * @memberof DB
   */
  public static async call(name: string, ...args: any[]) {
    return await DB.query(`call ??(${args.map(() => '?').join(',')})`, ...[name, ...args])
  }

  /**
   * Gets a count of results that would be found
   *
   * @returns {Promise<number>}
   * @memberof DB
   */
  public async count(): Promise<number> {
    let select = this._queryInfo.select
    let count = (await this.setSelect(new DBRaw('count(*) as c')).get())[0]['c']
    this.setSelect(...select)
    return <Promise<number>>count
  }

  /**
   * Gets the max value in a column
   *
   * @param {string} column
   * @returns {Promise<number>}
   * @memberof DB
   */
  public async max(column: string): Promise<number> {
    let select = this._queryInfo.select
    let max = (await this.setSelect(new DBRaw('max(??) as m', [column])).get())[0]['m']
    this.setSelect(...select)
    return <Promise<number>>max
  }

  /**
   * Gets the min value in a column
   *
   * @param {string} column
   * @returns {Promise<number>}
   * @memberof DB
   */
  public async min(column: string): Promise<number> {
    let select = this._queryInfo.select
    let min = (await this.setSelect(new DBRaw('min(??) as m', [column])).get())[0]['m']
    this.setSelect(...select)
    return <Promise<number>>min
  }

  /**
   * Gets the avg value in a column
   *
   * @param {string} column
   * @returns {Promise<number>}
   * @memberof DB
   */
  public async avg(column: string): Promise<number> {
    let select = this._queryInfo.select
    let avg = (await this.setSelect(new DBRaw('avg(??) as m', [column])).get())[0]['m']
    this.setSelect(...select)
    return <Promise<any>>avg
  }

  /**
   * Gets the sum of a column
   *
   * @param {string} column
   * @returns {Promise<number>}
   * @memberof DB
   */
  public async sum(column: string): Promise<number> {
    let select = this._queryInfo.select
    let sum = (await this.setSelect(new DBRaw('sum(??) as s', [column])).get())[0]['s']
    this.setSelect(...select)
    return <Promise<any>>sum
  }

  /**
   * Checks if a row exists
   *
   * @returns {Promise<boolean>}
   * @memberof DB
   */
  public async exists(): Promise<boolean> {
    let select = this._queryInfo.select
    let len = (await this.setSelect(new DBRaw('1')).get()).length
    this.setSelect(...select)
    return len > 0
  }

  /**
   * Checks if a row does not exist
   *
   * @returns {Promise<boolean>}
   * @memberof DB
   */
  public async doesntExist(): Promise<boolean> {
    let select = this._queryInfo.select
    let exists = await this.exists()
    this.setSelect(...select)
    return !exists
  }

  /**
   * Gets the results with a limit and the total number of results if the limit were removed
   *
   * @returns {Promise<{results:RowDataPacket[],total:number}>}
   * @memberof DB
   */
  public async calcFoundRows(): Promise<{ results: RowDataPacket[]; total: number; }> {
    // Get the original values
    let limit = this._queryInfo.limit, limitStart = this._queryInfo.offset, select = this._queryInfo.select, order = this._queryInfo.orderBy, trans = this._isTransaction
    this._isTransaction = true

    // Get the results
    let results = await this.get()

    // Get the results without a limit and with a count(*)
    this.limit(undefined).offset(undefined).setOrderBy().select(new DBRaw('count(*) as `red5_calc_found_rows`'))
    // console.log(await this.get())
    let total = (await this.get())[0]['red5_calc_found_rows']

    // Reset the values back to their original values
    this.limit(limit).offset(limitStart).setOrderBy(...order).setSelect(...select)
    this._isTransaction = trans
    // Return the data
    return { results, total }
  }

  /**
   * Gets query information based on the current page and the results per page
   *
   * @param {number} page The current page
   * @param {number} resultsPerPage The number of results per page
   * @param {boolean} enablePageRecalculation Re-runs the query if the page number is larger than the total page count returning the last page
   * @returns {Promise<DBPaginate>}
   * @memberof DB
   */
  public async paginate(page: number, resultsPerPage: number, enablePageRecalculation: boolean = true): Promise<DBPaginate> {
    // Set 'page' and 'resultsPerPage' to 1 if the value is less than 1 or contains non-digit values
    page = parseInt((page < 1 || !/\d+/.test(page.toString()) ? 1 : page).toString())
    resultsPerPage = parseInt((resultsPerPage < 1 || !/\d+/.test(resultsPerPage.toString()) ? 1 : resultsPerPage).toString())

    // Get the original values
    let limit = this._queryInfo.limit, limitStart = this._queryInfo.offset, select = this._queryInfo.select

    // Set the limit and get the query info
    let offset = (page - 1) * resultsPerPage
    let info = await this.limit(resultsPerPage).offset(offset).calcFoundRows()

    // If the page is larger than the page count re-run
    // the query with the correct page number
    if (enablePageRecalculation && page > Math.ceil(info.total / resultsPerPage)) {
      page = Math.ceil(info.total / resultsPerPage)
      offset = (Math.ceil(info.total / resultsPerPage) - 1) * resultsPerPage
      info = await this.limit(resultsPerPage).offset(offset).calcFoundRows()
    }

    // Reset the values back to their original values
    // This happens in 'calcFoundRows', however we need to do it again
    this.limit(limit).offset(limitStart).setSelect(...select)

    // Get the number of pages if 'resultsPerPage' is greater than '0'
    let pages = Math.ceil(info.total / resultsPerPage)

    return {
      results: info.results,
      count: info.results.length,
      total: info.total,
      pages,
      page,
      offset: offset < 0 ? 0 : offset,
      range: {
        start: offset + 1 < 0 ? 0 : offset + 1,
        end: offset + info.results.length < 0 ? 0 : offset + info.results.length
      },
      lastPage: pages === page,
      firstPage: page === 1
    }
  }

  //////////////////////////////////////////////////////////////////////////////
  /// End: Methods that initiate and run queries
  //////////////////////////////////////////////////////////////////////////////
}