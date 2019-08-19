import { DB, DBRaw, RowDataPacket, DBCell } from './DB';
import { Collection } from './Collection'
import { Collection as BaseCollection, KeyValuePair, get } from '@horsepower/server'

export interface FieldData {
  column: string
  value: any
}

export type NonAbstractModel<T extends Model> = (new () => T) & typeof Model

export interface Model extends DB {
  [key: string]: any
  get<T extends Model>(): Promise<Collection<T>>
  first<T extends Model>(): Promise<T | null>
}

export type PrimaryKey = DBCell | Record<Model["$primaryKey"][number], DBCell>

export abstract class Model extends DB {

  /** @type {string} The table that this model belongs to */
  public abstract $table: string = ''

  /** @type {string} The table's primary key field or an array of fields that makeup the primary key */
  public $primaryKey: string | string[] = 'id' as const

  /** @type {boolean} The primary key is assumed to be incrementing, disable this if it does not auto increment */
  protected $incrementing: boolean = true

  /** @type {string[]} An array of columns that will be referenced when filling the model */
  protected $fillable: string[] = []

  /**
   * @type {string} An optional connection name that is defined in `config/db.js`.
   * If a connection name isn't set, then use the default connection defined in `config/db.js`.
   */
  protected $connection: string | null = null

  private _isDirty: boolean = false

  /**
   * The primary key data
   *
   * @readonly
   * @type {PrimaryKey}
   * @memberof Model
   */
  public get primaryKey(): PrimaryKey {
    if (!Array.isArray(this.$primaryKey))
      return this[this.$primaryKey]
    else
      return Object.entries(this.fieldData)
        .filter(i => (<string[]>this.$primaryKey).includes(i[0]))
        .reduce((acc, i) => Object.assign(acc, { [i[0]]: i[1].value }), {})
  }

  /**
   * @type {[key: string]: any} Additional fields not specified in the database that are generated on the fly.
   */
  protected $attributes: { [key: string]: any } = {}

  private fieldData: FieldData[] = []

  public get data(): object {
    return this.fieldData.reduce((obj, itm) => {
      obj[itm.column] = itm.value
      return obj
    }, {})
  }

  protected constructor() {
    super()
    return new Proxy(this, {
      get: (target, prop, receiver) => {
        let data = target.fieldData.find(i => i.column == prop)
        if (!data) return Reflect.get(target, prop, receiver)
        return data.value
      },
      set: (target, prop, value, receiver) => {
        if (typeof prop == 'symbol' || typeof target[prop] != 'undefined') Reflect.set(target, prop, value, receiver)
        else {
          let item = target.fieldData.find(i => i.column == prop)
          if (item) {
            item.value = value
            this._isDirty = true
          } else {
            target.fieldData.push({ column: <string>prop, value })
            this._isDirty = true
          }
        }
        return true
      }
    })
  }

  [Symbol.iterator]() {
    let idx = -1
    let data = this.fieldData
    return {
      next: () => {
        return data[idx + 1] ?
          { value: data[++idx].value, done: false } :
          { done: true }
      }
    }
  }

  /**
   * Converts Database data to a model or collection of models
   */
  public static convert<T extends Model>(model: NonAbstractModel<T>, data: RowDataPacket[]): Collection<T>
  public static convert<T extends Model>(model: NonAbstractModel<T>, data: RowDataPacket): T
  public static convert<T extends Model>(model: NonAbstractModel<T>, data: null): null
  public static convert<T extends Model>(model: NonAbstractModel<T>, data: T): T
  public static convert<T extends Model>(model: NonAbstractModel<T>, data: T | RowDataPacket | RowDataPacket[] | null): Collection<T> | T | null {
    if (data instanceof Model) return data
    if (Array.isArray(data)) {
      let collection = new Collection<T>()
      for (let row of data) {
        let mod = new model()
        collection.add(mod)
        for (let k in row) {
          mod.setOrAddItem(k, row[k])
        }
      }
      return collection
    } else if (data) {
      let mod = new model()
      for (let k in data) {
        mod.setOrAddItem(k, data[k])
      }
      return mod
    }
    return null
  }

  private _init() {
    this.table(this.$table)
    super._connect(this.$connection)
  }

  public fill(items: BaseCollection<KeyValuePair>) {
    for (let item of items) {
      if (this.$fillable.length == 0 || this.$fillable.includes(item.key)) {
        this.setOrAddItem(item.key, item.value)
      }
    }
  }

  /** @internal */
  private _forceFill(items: BaseCollection<KeyValuePair>) {
    for (let item of items) {
      this.setOrAddItem(item.key, item.value)
    }
  }

  public async get<T extends Model>(): Promise<Collection<T>> {
    this._init()
    return Model.convert(<NonAbstractModel<T>>this.constructor, await super.get())
  }

  public async first<T extends Model>(): Promise<T | null> {
    this._init()
    let first = await super.first()
    if (first) return Model.convert(<NonAbstractModel<T>>this.constructor, first)
    return null
  }

  public async update(values: object): Promise<boolean> {
    this._init()
    return super.update(values)
  }

  /** @internal */
  private setOrAddItem(column: string, value: any) {
    let record = this.fieldData.find(i => i.column == column)
    if (record) record.value = value
    else this.fieldData.push({ column, value })
    return this
  }

  public async save(): Promise<boolean> {
    if (!this._isDirty) return true
    let fieldItems: string[] = this.fieldData.reduce<string[]>((a, i) => a.concat(i.column), [])
    let valueItems: string[] = this.fieldData.reduce<string[]>((a, i) => a.concat(i.value), [])
    let items: string[] = this.fieldData.reduce<string[]>((a, i) => a.concat(i.column, i.value), [])

    let queryFields = this.fieldData.map(() => '??').join(', ')
    let queryValues = this.fieldData.map(() => '?').join(', ')
    let queryParams = this.fieldData.map(() => '?? = ?').join(', ')

    this._isDirty = false
    return await DB.insert(
      `insert into ?? (${queryFields}) values (${queryValues}) on duplicate key update ${queryParams}`,
      ...[this.$table, ...fieldItems, ...valueItems, ...items]
    )
  }

  public async delete(): Promise<boolean> {
    // if(Array.isArray(this.$primaryKey))
    // DB.query(`delete from ?? where `)
    return false
  }

  public async exists(...fields: string[]): Promise<boolean> {
    let tbl = DB.table(this.$table)
    if (fields.length > 0) {
      for (let fld of fields) {
        let data = this.fieldData.find(i => i.column == fld)
        tbl.where(fld, data && data.value || '')
      }
    }
    return !!((await tbl.setSelect(new DBRaw('1')).get()).length)
  }

  public async chunk<T extends Model>(rows: number, callback: (rows: Collection<T>) => void): Promise<void>
  public async chunk<T extends Model>(callback: (rows: Collection<T>) => void): Promise<void>
  public async chunk<T extends Model>(...args: (number | Function)[]): Promise<void> {
    this._init()
    let rows = (args.length == 2 ? args[0] : 10) as number
    let callback = (args.length == 1 ? args[0] : args[1]) as (rows: Collection<T>) => void
    return await super.chunk(rows, callback)
  }

  private static _makeFindQuery<T extends Model>(primaryKey: any) {
    let c = Reflect.construct(this, []) as T

    // If the primary key is a string value and the primary key data is an array
    if (typeof c.$primaryKey == 'string' && Array.isArray(primaryKey)) {
      c.whereIn(c.$primaryKey, primaryKey)
    }

    // If the primary key is a single value and the primary key data is not an object
    else if (typeof c.$primaryKey == 'string' && typeof primaryKey != 'object') {
      c.where(c.$primaryKey, primaryKey)
    }

    // If the primary key columns value is an array of strings and the primary key data is an object
    else if (Array.isArray(c.$primaryKey) && typeof primaryKey == 'object') {
      for (let k of c.$primaryKey) {
        c.where(k, primaryKey[k])
      }
    }

    // Nothing matched return
    else {
      return null
    }
    return c
  }

  public static async find<T extends Model>(this: NonAbstractModel<T>, primaryKey: DBCell | object): Promise<T | null>
  public static async find<T extends Model>(this: NonAbstractModel<T>, primaryKey: DBCell[] | object[]): Promise<Collection<T>>
  public static async find<T extends Model>(this: NonAbstractModel<T>, primaryKey: DBCell | object | DBCell[] | object[]): Promise<Collection<T> | T | null> {

    let c = this._makeFindQuery(primaryKey)
    if (!c) return null

    // We now have something to query try and find the item in the database
    let items = await c.get<T>()

    // If no item was found in the database return null
    if (!items.length) return null

    // If an item was found return the model
    return items.length > 1 ? items : items[0]
  }

  public static async findOrFail<T extends Model>(this: NonAbstractModel<T>, primaryKey: DBCell[] | object[]): Promise<Collection<T>>
  public static async findOrFail<T extends Model>(this: NonAbstractModel<T>, primaryKey: DBCell | object): Promise<T | null>
  public static async findOrFail<T extends Model>(this: NonAbstractModel<T>, primaryKey: any | object | DBCell[] | object[]): Promise<Collection<T> | T> {
    let r = await this.find<T>(primaryKey) as Collection<T> | T | null
    if ((r instanceof Collection && r.length == 0) || !r) throw new Error(`Could not find any Models for "${this.name}"`)
    return r
  }
  /**
   * Gets the first item in the database that matches the filter
   *
   * @static
   * @template T
   * @param {NonAbstractModel<T>} this
   * @param {object} filter The filter to search upon
   * @returns {(Promise<T | null>)}
   * @memberof Model
   */
  public static async first<T extends Model>(this: NonAbstractModel<T>, filter: object): Promise<T | null> {
    let c = Reflect.construct(this, []) as T

    Object.entries(filter).forEach(i => { c.where(i[0], i[1]) })

    // We have something to query try and find the first item in the database that matches
    let item = await c.first<T>()

    // If no item was found in the database return null
    if (!item) return null

    // If an item was found return the model
    return item
  }
  /**
   * Attempts to find the first record in the database if it is not found an error will be thrown
   *
   * @static
   * @template T
   * @param {NonAbstractModel<T>} this
   * @param {object} filter
   * @returns {Promise<T>}
   * @memberof Model
   */
  public static async firstOrFail<T extends Model>(this: NonAbstractModel<T>, filter: object): Promise<T> {
    let r = await this.first<T>(filter)
    if (!r) throw new Error(`Could not find a Model for "${this.name}"`)
    return r
  }

  /**
   * Attempts to find a record in the database if it is not found a new model will be returned.
   * **Note:** The new model is not saved to the database `save()` must be called for the data to persist
   *
   * @static
   * @template T
   * @param {NonAbstractModel<T>} this
   * @param {object} filter The filter to search the database with
   * @param {object} [fill] The data to fill the new model with
   * @returns {Promise<T>}
   * @memberof Model
   */
  public static async firstOrNew<T extends Model>(this: NonAbstractModel<T>, filter: object, fill?: object): Promise<T> {
    let result = await this.first<T>(filter)
    if (result) return result
    let item = Reflect.construct(this, []) as T
    if (fill) item.fill(new BaseCollection<KeyValuePair>(Object.entries(Object.assign({}, filter, fill))))
    return item
  }

  /**
   * Attempts to find a record in the database if it is not found a new model will be returned.
   * **Note:** The new model is saved to the database when created.
   *
   * @static
   * @template T
   * @param {NonAbstractModel<T>} this
   * @param {(any | object)} filter
   * @param {object} [fill]
   * @returns {Promise<T>}
   * @memberof Model
   */
  public static async firstOrCreate<T extends Model>(this: NonAbstractModel<T>, filter: any | object, fill?: object): Promise<T> {
    let r = await this.first<T>(filter)
    if (r) return r
    let model = Reflect.construct(this, []) as T
    model._forceFill(new BaseCollection<KeyValuePair>(Object.entries(Object.assign({}, filter, fill))))
    await model.save()
    return model
  }
  /**
   * Gets all of the items in a table.
   * **WARNING:** This will return all results. DO NOT USE ON LARGE SETS OF DATA!
   *
   * @static
   * @template T
   * @param {NonAbstractModel<T>} this
   * @returns {Promise<Collection<T>>}
   * @memberof Model
   */
  public static async all<T extends Model>(this: NonAbstractModel<T>): Promise<Collection<T>> {
    let model = Reflect.construct(this, []) as T
    let items = await model.get<T>()
    return items
  }
}