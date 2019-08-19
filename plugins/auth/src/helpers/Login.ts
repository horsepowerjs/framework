import { Client, getConfig } from '@horsepower/server'
import { DB, Model } from '@horsepower/mysql'
import * as bcrypt from 'bcrypt'
import { AuthSettings } from '../routes'

class Auth extends Model {
  public $table: string = ''
  public constructor(table: string) {
    super()
    this.$table = table
  }
}

export class Login {

  private config?: AuthSettings

  public get table() {
    return this.config && this.config.table || 'auth'
  }

  public get idField() { return this.config && this.config.dbFields && this.config.dbFields.id || 'id' }
  public get userField() { return this.config && this.config.dbFields && this.config.dbFields.username || 'username' }
  public get passField() { return this.config && this.config.dbFields && this.config.dbFields.password || 'password' }

  public constructor(protected client: Client) {
    if (!this.client.session) throw new Error('The "Auth" package depends on sessions to work properly.')
    this.config = getConfig<AuthSettings>('auth')
  }

  public async login(username: string, password: string): Promise<boolean> {
    let row = await DB.table(this.table).where(this.userField, username).first()
    if (!row) return false
    if (await bcrypt.compare(password, row[this.passField])) {
      if (!this.client.session) return false
      this.client.session.set('auth.username', row[this.userField])
      this.client.session.set('auth.id', row[this.idField])
      return true
    }
    return false
  }

  public async join(username: string, password: string) {

    let hash = await bcrypt.hash(password, 10)

    let auth = new Auth(this.table)
    auth.userField = username
    auth.passField = hash
    // auth.set(this.userField, username)
    // auth.set(this.passField, hash)
    if (!await auth.exists(this.userField)) {
      return await auth.save()
    }
    return false
    // let row = await DB.table(this.table).where(userField, username).first()
    // if (!row) return false
    // if (await bcrypt.compare(password, row[passField])) {
    //   if (!this.client.session) return false
    //   this.client.session.set('auth.username', row[userField])
    //   this.client.session.set('auth.id', row[idField])
    //   return true
    // }
    // return false
  }

  public async logout() {
    this.client.session && (await this.client.session.destroy())
  }
}