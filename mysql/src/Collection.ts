import { Collection as BaseCollection } from '@horsepower/server'
import { DBCell } from './DB'
import { Model, PrimaryKey } from './Model'

export class Collection<T extends Model> extends BaseCollection<T> {
  public contains(key: (DBCell & object) | Model): boolean {
    // if (key instanceof Model) {
    //   return this._items.some(itm => {
    //     if (Array.isArray(itm.$primaryKey)) {
    //       return itm.$primaryKey.every(i => typeof key == 'object' ? itm[i] == key[i] : itm[i] == key)
    //     } else {
    //       return this[itm.$primaryKey] == key
    //     }
    //   })
    // } else {
    return this._items.some(itm => {
      if (Array.isArray(itm.primaryKey)) {
        return itm.primaryKey.every(i => typeof key == 'object' ? itm[i] == key[i] : itm[i] == key)
      } else {
        return key instanceof Model ? itm.primaryKey == key.primaryKey : itm.primaryKey == key
      }
    })
    // }
  }
  // public diff() { }
  // public except() { }
  // public find() { }
  // public fresh() { }
  // public intersect() { }
  // public load() { }
  // public loadMissing() { }

  public modelKeys() {
    return this._items.map(i => i.primaryKey)
  }

  // public makeVisible() { }
  // public makeHidden() { }

  public only(...keys: PrimaryKey[]) {
    return this._items.filter(i => keys.includes(i.primaryKey))
  }

  // public unique() { }

  public toJson() {
    let items = this._items.reduce<object[]>((arr, itm) => arr.concat(itm.data), [])
    return JSON.stringify(items)
  }
}