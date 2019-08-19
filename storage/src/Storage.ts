import * as path from 'path'
import { getConfig, log } from '@horsepower/server'
import { StorageSettings } from '.'
import { FileConfiguration } from './drivers/file'
import { URL } from 'url'

export interface StorageDisk {
  driver: string,
  root: string,
  options?: object
}

export abstract class Storage<OptionsType extends object>  {
  /**
   * Boots the disk up, this will execute any startup commands that need to run
   * to startup the disk such as connecting to external servers with username/passwords.
   * @internal
   */
  public boot(config: StorageDisk): void { }
  /**
   * Shuts the disk down, this will execute any commands for cleanup, such as
   * disconnecting from external servers.
   * @internal
   */
  public shutdown(): void { }

  protected disk: StorageDisk & { options: OptionsType }
  protected get root(): string {
    return this.disk.root
  }

  public name: string = ''

  private static config: StorageSettings | null = null

  public constructor(config: StorageDisk) {
    this.disk = Object.freeze(config) as any
  }

  /**
   * Copies a file from one storage driver to another
   *
   * @param {Storage | string} source The source storage driver
   * @param {string} sourceObject The path of the file on the source driver
   * @param {string} destinationObject The path to the destination on the current driver
   * @returns {Promise<boolean>} Whether or not the file was successfully copied
   */
  public async copyFrom(source: Storage<OptionsType> | string, sourceObject: string, destinationObject: string): Promise<boolean> {
    let storageSource = typeof source == 'string' ? Storage.mount(source) : source
    if (await storageSource.exists(sourceObject)) {
      let storageSource = typeof source == 'string' ? Storage.mount(source) : source
      let file = await storageSource.read(sourceObject)
      return await this.write(destinationObject, file)
    }
    return false
  }

  /**
   * Moves a file from one storage driver to another
   *
   * @param {Storage | string} sourceDriver The source storage driver
   * @param {string} sourceObject The path of the file on the source driver
   * @param {string} destinationObject The path to the destination on the current driver
   * @param {boolean} [deleteOnFailure=false] Deletes the source even if the destination couldn't be written to
   * @returns {Promise<boolean>} Whether or not the file was successfully moved
   */
  public async moveFrom(sourceDriver: Storage<object> | string, sourceObject: string, destinationObject: string, deleteOnFailure: boolean = false): Promise<boolean> {
    let storageSource = typeof sourceDriver == 'string' ? Storage.mount(sourceDriver) : sourceDriver
    if (await storageSource.exists(sourceObject)) {
      let file = await storageSource.read(sourceObject)
      if (await this.write(destinationObject, file) || deleteOnFailure) {
        // If the write was successful, delete the source.
        return await storageSource.delete(sourceObject)
      }
    }
    return false
  }

  /**
   * This forces the root directory to be the root of the driver.
   * No paths will be able to access other items outside of the drivers root.
   *
   * @param {string} root The root of the driver
   * @param {string} objectPath The path to the object
   * @returns {string} The forced path
   */
  protected forceRoot(objectPath: string): string | URL {
    if (/^https?:\/\//i.test(this.root)) {
      return new URL(this.root + path.posix.resolve('/', objectPath))
    }
    return path.posix.join(this.root, path.posix.resolve('/', objectPath))
  }

  /**
   * Mounts the default disk
   *
   * @static
   * @template T
   * @returns {T}
   * @memberof Storage
   */
  public static mount<T extends Storage<object>>(): T

  /**
   * Mounts a particular disk
   *
   * @static
   * @template T
   * @param {string} disk The name of the disk
   * @returns {T}
   * @memberof Storage
   */
  public static mount<T extends Storage<object>>(disk: string): T
  /**
   * Mounts a disk not defined within the config
   *
   * @static
   * @param {{ root: string }} disk
   * @returns {Storage}
   * @memberof Storage
   */
  public static mount<T extends Storage<object>>(disk: StorageDisk): T
  public static mount<T extends Storage<object>>(driver?: string | StorageDisk): T {
    if (typeof driver == 'string') {
      this.config = getConfig<StorageSettings>('storage') || null

      if (driver == 'tmp') {
        // If the user defined their own tmp config use it
        if (this.config && this.config.disks && this.config.disks.tmp) {
          return this.getDriver(this.config.disks.tmp) as T
        }

        // The user didn't define their own tmp config so use the system tmp directory
        return this.getDriver(<FileConfiguration>{
          driver: 'file',
          root: require('os').tmpdir()
        }) as T
      }

      if (!this.config) throw new Error('No storage configuration file found at "config/storage.js"')

      if (!driver) driver = this.config.default
      let name = Object.keys(this.config.disks).find(disk => disk == driver)
      let config: StorageDisk | null = null

      if (!name) throw new Error(`No storage found for "${name}"`)
      config = this.config.disks[name]
      if (!config) throw new Error(`Cannot find the storage driver "${driver}"`)

      let storageDriver = this.getDriver(config)
      storageDriver.name = name
      return storageDriver as T
    } else if (driver) {
      return this.getDriver(driver) as T
    }
    throw new Error(`Cannot find and mount the driver`)
  }

  private static getDriver(config: StorageDisk): Storage<object> {
    try {
      // Try and load a builtin driver from the "drivers" directory
      let driver = require(path.join(__dirname, './drivers', config.driver))
      return new driver.default(config) as Storage<object>
    } catch (e) {
      try {
        let err = JSON.parse(e.message)
        if (err.code == 'dependency-not-found') {
          throw err.msg
        }
      } catch (e) {
        log.error(e)
        throw e
      }

      try {
        // Try and load the driver from the root "node_modules" in the users project
        if (require.main && require.main.require) {
          let driver = require.main.require(config.driver)
          return new driver.default(config) as Storage<object>
        }
        throw e //new Error(`Cannot find the driver "${config.driver}"`)
      } catch (e) {
        // console.error(e.message)
        log.error(e)
        throw e
        // log.error(e)
        // throw new Error(`Cannot find and mount the driver "${config.driver}"`)
      }
    }
  }

  public static write(path: string, data: string | Buffer) {
    return this.mount().write(path, data)
  }

  public static read(path: string) {
    return this.mount().read(path)
  }

  public static delete(path: string) {
    return this.mount().delete(path)
  }

  public static exists(path: string) {
    return this.mount().exists(path)
  }

  public static isFile(path: string) {
    return this.mount().isFile(path)
  }

  public static isDirectory(path: string) {
    return this.mount().isDirectory(path)
  }

  public static prepend(path: string, data: string | Buffer) {
    return this.mount().prepend(path, data)
  }

  public static append(path: string, data: string | Buffer) {
    return this.mount().append(path, data)
  }

  public static copy(source: string, destination: string) {
    return this.mount().copy(source, destination)
  }

  public static move(source: string, destination: string) {
    return this.mount().move(source, destination)
  }

  public static copyFrom(source: Storage<object> | string, sourceFile: string, destinationFile: string) {
    return this.mount().copyFrom(source, sourceFile, destinationFile)
  }

  public static moveFrom(source: Storage<object> | string, sourceFile: string, destinationFile: string) {
    return this.mount().moveFrom(source, sourceFile, destinationFile)
  }

  public static path(path: string) {
    return this.mount().toPath(path)
  }

  /**
   * Saves a file to storage if the file exists overwrite it.
   * If the folder path doesn't exist save will automatically create the path.
   *
   * @param {string} filePath The location of the file/directory
   * @param {(string | Buffer)} data The data to save
   * @param {object} [options] The save options for when saving the file
   * @returns {Promise<boolean>}
   */
  public abstract async write(filePath: string, data: string | Buffer, options?: object): Promise<boolean>
  /**
   * Loads a file from file storage
   *
   * @param {string} filePath The location of the file/directory
   * @param {object} [options] The save options for when saving the file
   * @returns {(Promise<Buffer>)}
   */
  public abstract async read(filePath: string, options?: object): Promise<Buffer>
  /**
   * Deletes a file from storage
   *
   * @param {string} filePath The location of the file/directory
   * @returns {Promise<boolean>}
   */
  public abstract async delete(filePath: string): Promise<boolean>
  /**
   * Prepends data to the beginning of a file
   *
   * @param {string} filePath The location of the file
   * @param {(string | Buffer)} data The data to prepend to the beginning of the file
   * @returns {Promise<boolean>}
   */
  public abstract async prepend(filePath: string, data: string | Buffer): Promise<boolean>
  /**
   * Appends data to the end of a file
   *
   * @param {string} filePath The location of the file
   * @param {(string | Buffer)} data The data to append to the end of the file
   * @returns {Promise<boolean>}
   */
  public abstract async append(filePath: string, data: string | Buffer): Promise<boolean>
  /**
   * Copies a file or directory from one location to another location
   *
   * @param {string} source The original location of the file/directory
   * @param {string} destination The new location of the file/directory
   * @returns {Promise<boolean>}
   */
  public abstract async copy(source: string, destination: string): Promise<boolean>
  /**
   * Moves a file or directory from one location to another location
   *
   * @param {string} source The original location of the file/directory
   * @param {string} destination The new location of the file/directory
   * @returns {Promise<boolean>}
   */
  public abstract async move(source: string, destination: string): Promise<boolean>
  /**
   * Checks if a file or directory exists
   *
   * @param {string} filePath The location of the file/directory
   * @returns {Promise<boolean>}
   */
  public abstract async exists(filePath: string): Promise<boolean>
  /**
   * Checks if a path is a file
   *
   * @abstract
   * @param {string} filePath The path to the file
   * @returns {Promise<boolean>}
   * @memberof Storage
   */
  public abstract async isFile(filePath: string): Promise<boolean>
  /**
   * Checks if a path is a directory
   *
   * @abstract
   * @param {string} filePath The path to the directory
   * @returns {Promise<boolean>}
   * @memberof Storage
   */
  public abstract async isDirectory(filePath: string): Promise<boolean>
  /**
   * Gets the full path to a file or directory
   *
   * @abstract
   * @param {string} filePath The path to the file or directory
   * @returns {string}
   * @memberof Storage
   */
  public abstract toPath(filePath: string): string
}