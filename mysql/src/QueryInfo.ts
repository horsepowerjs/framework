import { DBKeyVal, DBRaw, DBBetween, DBIn, DBMatchAgainst, DBNull, DBSort, DBValue } from './DB';

export declare type QueryType = 'select' | 'insert' | 'update' | 'delete' | 'replace'

export class QueryInfo {
  private readonly _operators = ['=', '<', '>', '>=', '<=', '!=', '<>']

  private _selectQuery: string = ''
  private _updateQuery: string = ''
  private _deleteQuery: string = ''
  private _insertQuery: string = ''
  private _replaceQuery: string = ''
  private _queryType: QueryType = 'select'

  private _table?: string
  private _limit?: number
  private _offset?: number
  private _distinct: boolean = false

  private _groupBy: { column: string, sort: DBSort }[] = []
  private _orderBy: { column: string, sort: DBSort }[] = []
  private _where: (DBKeyVal | DBRaw | DBBetween | DBIn | DBMatchAgainst | DBNull)[] = []
  private _having: (DBKeyVal | DBRaw | DBBetween | DBIn | DBNull)[] = []
  private _select: (string | DBRaw | DBMatchAgainst)[] = []
  private _set: (DBKeyVal)[] = []
  private _dupKeyUp: (DBKeyVal)[] = []

  private _selectPlaceholders: DBValue[] = []
  private _updatePlaceholders: DBValue[] = []
  private _deletePlaceholders: DBValue[] = []
  private _insertPlaceholders: DBValue[] = []
  private _replacePlaceholders: DBValue[] = []

  public static analyze(query: string) {
    let q = query.trim()
    const info = new QueryInfo
    let queryType = ((q.match(/^select|insert|update|delete|replace/i) || ['select'])[0]).toLowerCase() as QueryType
    switch (queryType) {
      case 'select':
        let [fullSelect, c, t] = [...(q.match(/^select(.+)from(.+)(where|limit|group|having|$)/i) || [])]
        info.select = c.split(',').map(i => i.replace(/,|`/g, '').trim().replace(/^('|")|('|")$/g, ''))
        info.table = t
        break;
    }
    return info
  }

  public get selectPlaceholders() { return this._selectPlaceholders }
  public get updatePlaceholders() { return this._updatePlaceholders }
  public get deletePlaceholders() { return this._deletePlaceholders }
  public get insertPlaceholders() { return this._insertPlaceholders }
  public get selectQuery() { return this._selectQuery }
  public get updateQuery() { return this._updateQuery }
  public get deleteQuery() { return this._deleteQuery }
  public get insertQuery() { return this._insertQuery }
  public get replaceQuery() { return this._replaceQuery }

  // public get filter() { return this._getFilter(this._where) }
  public get queryType() { return this._queryType }

  public set table(value: string | undefined) { this._table = value, this._update() }
  public set limit(value: number | undefined) { this._limit = value, this._update() }
  public set offset(value: number | undefined) { this._offset = value, this._update() }
  public set distinct(value: boolean) { this._distinct = value, this._update() }
  public set groupBy(value: { column: string, sort: DBSort }[]) { this._groupBy = value, this._update() }
  public set orderBy(value: { column: string, sort: DBSort }[]) { this._orderBy = value, this._update() }
  public set where(value: (DBKeyVal | DBRaw | DBBetween | DBIn | DBMatchAgainst | DBNull)[]) { this._where = value, this._update() }
  public set having(value: (DBKeyVal | DBRaw | DBBetween | DBIn | DBNull)[]) { this._having = value, this._update() }
  public set select(value: (string | DBRaw | DBMatchAgainst)[]) { this._select = value, this._update() }

  public get table() { return this._table }
  public get limit() { return this._limit }
  public get offset() { return this._offset }
  public get distinct() { return this._distinct }
  public get groupBy() { return this._groupBy }
  public get orderBy() { return this._orderBy }
  public get where() { return this._where }
  public get having() { return this._having }
  public get select() { return this._select }

  public addGroupBy(...value: { column: string, sort: DBSort }[]) { this._groupBy.push(...value), this._update() }
  public addOrderBy(...value: { column: string, sort: DBSort }[]) { this._orderBy.push(...value), this._update() }
  public addWhere(...value: (DBKeyVal | DBRaw | DBBetween | DBIn | DBMatchAgainst | DBNull)[]) { this._where.push(...value), this._update() }
  public addHaving(...value: (DBKeyVal | DBRaw | DBBetween | DBIn | DBNull)[]) { this._having.push(...value), this._update() }
  public addSelect(...value: (string | DBRaw | DBMatchAgainst)[]) { this._select.push(...value), this._update() }
  public addSet(...value: (DBKeyVal)[]) { this._set.push(...value), this._update() }
  public addDuplicateKeyUpdate(...value: (DBKeyVal)[]) { this._dupKeyUp.push(...value), this._update() }

  private _update() {
    this._selectQuery = this._buildSelectString().trim()
    this._updateQuery = this._buildUpdateString().trim()
    this._deleteQuery = this._buildDeleteString().trim()
    this._insertQuery = this._buildInsertString().trim()
    this._replaceQuery = this._buildReplaceString().trim()
    this._queryType = (this._selectQuery.match(/^select|insert|update|delete|replace/i) || ['select'])[0] as QueryType
  }

  /**
   * Builds the current SELECT query string
   *
   * @returns {string}
   * @memberof DB
   */
  private _buildSelectString(): string {
    // if (!this._table) throw new Error('Table name not set')

    this._selectPlaceholders = []
    // Create the column list string
    let columns = this._select.length == 0 ? '*' : this._select.map(i => {
      if (i instanceof DBRaw) return i.value
      else if (i instanceof DBMatchAgainst) return `match (${i.columns.map(c => '??')}) against (? in boolean mode) as ??`
      else if (/\(|\*|,|\)/.test(i)) return i
      return '??'
    }).join(', ')
    this._selectPlaceholders.push(...(<string[]>this._select.filter(i => i instanceof DBRaw || i instanceof DBMatchAgainst || !(/\(|\*|,|\)/.test(i)))))
    this._selectPlaceholders = this._selectPlaceholders.reduce<DBValue[]>((arr, itm) => {
      if (itm instanceof DBMatchAgainst) return arr.concat(itm.columns, itm.search, itm.alias)
      if (itm instanceof DBRaw) return arr.concat(itm.replacements)
      return arr.concat(itm)
    }, [])

    // Create the initial select string
    let str = [`select ${this._distinct ? 'distinct' : ''} ${columns} from ??`]
    this._selectPlaceholders.push(this._table as string)

    // If there are where items, build the where item list
    if (this._where.length > 0) {
      let where = this._getFilter(this._selectPlaceholders, this._where)
      str.push(`where ${where}`)
    }

    // If there is grouping group the items
    if (this._groupBy.length > 0) {
      str.push(`group by ${this._groupBy.map(i => '?? ' + i.sort).join(', ')}`)
      this._selectPlaceholders.push(...this._groupBy.map(i => i.column))
    }

    if (this._having.length > 0) {
      let having = this._getFilter(this._selectPlaceholders, this._having)
      str.push(`having ${having}`)
    }

    // // If there is ordering order the items
    if (this._orderBy.length > 0) {
      str.push(this._getOrderBy(this._selectPlaceholders))
    }

    // If there is a limit and an offset
    if (this._limit && this._limit > 0 && this._offset && this._offset > 0) str.push(`limit ${this._limit} offset ${this._offset}`)
    // If there isn't a limit but there is an offset
    else if (!this._limit && this._offset && this._offset > 0) str.push(`limit ${Number.MAX_SAFE_INTEGER} offset ${this._offset}`)
    // If there is a limit and there isn't an offset
    else if (this._limit && this._limit > 0 && !this._offset) str.push(`limit ${this._limit} offset 0`)

    // Return the query as a string
    return str.join(' ')
  }

  private _buildUpdateString(): string {

    this._updatePlaceholders = []
    let str = ['update']

    // Add the table to the query
    str.push('??')
    this._updatePlaceholders.push(this._table as string)

    // If there are where items, build the where item list
    if (this._set.length > 0) {
      this._set.forEach(i => {
        this._updatePlaceholders.push(i.column)
        this._updatePlaceholders.push(i.value)
      })
      str.push(`set`, this._set.map(() => '?? = ?').join(', '))
    }

    // If there are where items, build the where item list
    if (this._where.length > 0) {
      let where = this._getFilter(this._updatePlaceholders, this._where)
      str.push(`where ${where}`)
    }

    // If there is an order add the order by
    if (this._orderBy.length > 0) {
      let order = this._getOrderBy(this._updatePlaceholders)
      str.push(order)
    }

    // If there is a limit add the limit
    if (this._limit && this._limit > 0) {
      str.push(`limit ${this._limit}`)
    }

    return str.join(' ')
  }

  private _buildDeleteString() {

    this._deletePlaceholders = []
    let str = ['delete from']

    // Add the table to the query
    str.push('??')
    this._deletePlaceholders.push(this._table as string)

    // If there are where items, build the where item list
    if (this._where.length > 0) {
      let where = this._getFilter(this._deletePlaceholders, this._where)
      str.push(`where ${where}`)
    }

    // If there is an order add the order by
    if (this._orderBy.length > 0) {
      let order = this._getOrderBy(this._deletePlaceholders)
      str.push(order)
    }

    // If there is a limit add the limit
    if (this._limit && this._limit > 0) {
      str.push(`limit ${this._limit}`)
    }

    return str.join(' ')
  }

  private _buildInsertString() {

    this._insertPlaceholders = []
    let str = ['insert into']

    // Add the table to the query
    str.push('??')
    this._insertPlaceholders.push(this._table as string)

    // If there are settable items, build the set
    if (this._set.length > 0) {
      this._set.forEach(i => {
        this._insertPlaceholders.push(i.column)
        this._insertPlaceholders.push(i.value)
      })
      str.push(`set`, this._set.map(() => '?? = ?').join(', '))
    }

    return str.join(' ')
  }

  private _buildReplaceString() {

    this._replacePlaceholders = []
    let str = ['replace into']

    // Add the table to the query
    str.push('??')
    this._replacePlaceholders.push(this._table as string)

    if (this._set.length > 0) {
      this._set.forEach(i => {
        this._replacePlaceholders.push(i.column)
        this._replacePlaceholders.push(i.value)
      })
      str.push(`set`, this._set.map(() => '?? = ?').join(', '))
    }

    return str.join(' ')
  }

  /**
   * Gets the filter for the WHERE or HAVING statements.
   *
   * @private
   * @param {any[]} filters
   * @returns {string}
   * @memberof DB
   */
  private _getFilter(placeholders: DBValue[], filters: any[]): string {
    let filter = filters.map((i, idx) => {
      if (i instanceof DBRaw) {
        placeholders.push(...i.replacements)
        return i.value
      } else if (i instanceof DBBetween) {
        placeholders.push(i.column, i.value1, i.value2)
        return `${idx == 0 ? '' : i.type} ?? ${i.not ? 'not' : ''} between ? and ?`
      } else if (i instanceof DBIn) {
        placeholders.push(i.column, ...i.items)
        return `${idx == 0 ? '' : i.type} ?? ${i.not ? 'not' : ''} in(${i.items.map(v => '?').join(',')})`
      } else if (i instanceof DBNull) {
        placeholders.push(i.column)
        return `${idx == 0 ? '' : i.type} ?? ${i.not ? 'not' : ''} null`
      } else if (i instanceof DBMatchAgainst) {
        placeholders.push(...i.columns, i.search)
        let modifier = ''
        switch (i.modifier) {
          case 'natural': modifier = 'in natural language mode'; break;
          case 'expansion': modifier = 'with query expansion'; break;
          case 'boolean': modifier = 'in boolean mode'; break;
          default: modifier = 'in natural language mode'; break;
        }
        return `${idx == 0 ? '' : i.type} match (${i.columns.map(() => '??').join(',')}) against (? ${modifier})`
      }
      else if (i instanceof DBKeyVal) {
        placeholders.push(i.column, i.value)
        return `${idx == 0 ? '' : i.type} ?? ${this._operators.includes(i.comp) ? i.comp : '='} ?`.trim()
      }
    })
    return filter.length > 0 ? filter.join(' ') : ''
  }

  private _getOrderBy(placeholders: DBValue[]) {
    let str = `order by ${this._orderBy.map(i => '?? ' + i.sort).join(', ')}`
    placeholders.push(...this._orderBy.map(i => i.column))
    return str
  }

}