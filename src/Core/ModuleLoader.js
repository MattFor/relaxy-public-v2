'use strict';

import time from 'pretty-ms';

const charTable = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

const SOURCE_ROOT = new URL('../', import.meta.url);
const resolveModulePath = modulePath => (/^(?:file:|https?:|\/)/.test(modulePath)
    ? modulePath
    : new URL(modulePath, SOURCE_ROOT).href);

export const getNestedProperty = (obj, path) => typeof path === 'string' && path.length > 0
    ? path.split('.').reduce((acc, key) => acc?.[key], obj)
    : undefined;

export const explainHotReloadLimit = error =>
{
    const message = String(error?.message ?? error);
    const missing = message.match(/does not provide an export named '([^']+)'/)?.[1];

    if (!missing)
    {
        return null;
    }

    const from = message.match(/The requested module '([^']+)'/)?.[1] ?? 'a shared module';

    return [
        'HOT RELOAD CANNOT APPLY THIS CHANGE - restart the bot.',
        `  '${missing}' is a NEW export in ${from}.`,
        '  ESM modules cannot be evicted from the cache, so every file that already imported',
        `  ${from} still sees the copy loaded at boot - the one without it.`,
        '  Nothing is broken: the export exists on disk. The running process just cannot see',
        '  it until it starts again. Re-saving the file will not help.'
    ].join('\n');
};

export default class ModuleLoader
{
    constructor(source, onLoadFunc, logArguments, logFuncs)
    {
        this.source = source ?? {};

        this.modules = {};
        this.moduleLog = [];
        this.modulePaths = {};
        this.moduleSourcePaths = {};

        this.onLoadFunc = onLoadFunc;

        this.logArguments = (logArguments && typeof logArguments === 'object')
            ? logArguments
            : {
                info:  logArguments,
                data:  logArguments,
                warn:  logArguments,
                debug: logArguments,
                error: logArguments
            };
        this.logFuncs = (logFuncs && typeof logFuncs === 'object')
            ? logFuncs
            : {
                info:  logFuncs,
                data:  logFuncs,
                warn:  logFuncs,
                debug: logFuncs,
                error: logFuncs
            };
    }

    setOnLoadFunc(func)
    {
        this.logFuncs.debug(this.logArguments.warn, 'Setting new onLoadFunc.');
        return this.onLoadFunc = func;
    }

    async reloadAll(args)
    {
        this.logFuncs.warn(this.logArguments.warn, 'Attempting to reload ALL modules.');

        const loadedModules = Object.keys(this.modules).filter(key => this.modules[key] != null);

        for (const module of loadedModules)
        {
            await this.loadModule(module,
                typeof args === 'object' && args !== null
                    ? args[module]
                    : args,
                true);
        }

        return this.logFuncs.warn(this.logArguments.warn, 'All modules cycled. Reload Complete.');
    }

    async loadModule(modulePath, args, overwrite, silent, noReplaceInSource, customSourcePath, errOnly, customExportName)
    {
        customExportName = customExportName ?? 'default';

        if (!overwrite && Object.values(this.modulePaths).find(p => typeof p === 'string' && p.includes(modulePath)))
        {
            return;
        }

        this.moduleLog.push(modulePath);
        const logIndex = this.moduleLog.length - 1;

        const MISSING = Symbol('missing');
        const sourceValue = customSourcePath
            ? customSourcePath.split('.').reduce((obj, key) => (obj !== MISSING && obj && Object.prototype.hasOwnProperty.call(obj, key))
                ? obj[key]
                : MISSING, this.source)
            : MISSING;

        const moduleExistsInSource = sourceValue !== MISSING && sourceValue !== null && sourceValue !== undefined;

        if (!silent && !errOnly)
        {
            this.logFuncs.debug(this.logArguments.debug, `${moduleExistsInSource} - Checking source with key: ${customSourcePath} for module: ${modulePath}`);
        }

        if (!overwrite && moduleExistsInSource)
        {
            const rawExport = getNestedProperty(this.source, customSourcePath);

            let registrationName = customSourcePath;
            if (typeof rawExport === 'function' && rawExport.name)
            {
                registrationName = rawExport.name;
            }
            else if (rawExport && typeof rawExport === 'object' && rawExport.name)
            {
                registrationName = rawExport.name;
            }

            let storedModule = rawExport;
            if (typeof rawExport === 'function' && rawExport.prototype && Object.keys(rawExport.prototype).length)
            {
                try
                {
                    const ctorArgs = Array.isArray(args)
                        ? args
                        : (args === undefined
                            ? []
                            : [args]);
                    storedModule = (args === 0b101)
                        ? rawExport
                        : new rawExport(...ctorArgs);

                    if (!silent && !errOnly)
                    {
                        this.logFuncs.info(this.logArguments.info, `[${logIndex}] Instantiated "${registrationName}" from source`);
                    }
                }
                catch (e)
                {
                    if (!silent)
                    {
                        this.logFuncs.error(this.logArguments.error, `[${logIndex}] Instantiation failed for "${registrationName}":`, e);
                    }

                    storedModule = rawExport;
                }
            }

            this.modules[registrationName] = storedModule;
            this.modulePaths[registrationName] = modulePath;
            this.moduleSourcePaths[registrationName] = customSourcePath;

            if (!silent && !errOnly)
            {
                this.logFuncs.info(this.logArguments.info, `[${logIndex}] Loaded "${modulePath}" from source key "${customSourcePath}" as "${registrationName}"`);
            }

            return registrationName;
        }

        let module = null;
        const start = Date.now();

        if (!silent && !errOnly)
        {
            this.logFuncs.debug(this.logArguments.debug, `[${logIndex}] Attempting to load module: "${modulePath}" property: ${customExportName}`);
        }

        try
        {
            module = await import(`${resolveModulePath(modulePath)}?foo=${(() =>
            {
                let result = '';

                for (let i = 0; i < 20; i++)
                {
                    result += charTable.charAt(Math.floor(Math.random() * 62));
                }

                return result;
            })()}`);
        }
        catch (e)
        {
            if (!silent)
            {
                const limitation = explainHotReloadLimit(e);

                this.logFuncs.error(this.logArguments.error, `[${logIndex}] Loading module: "${modulePath}" - FAILURE ${time(Date.now() - start)}`);

                this.logFuncs.error(this.logArguments.error, limitation ?? e);
            }

            return;
        }

        if (!Object.prototype.hasOwnProperty.call(module, customExportName))
        {
            return this.logFuncs.error(this.logArguments.error, `[${logIndex}] Loading module: "${modulePath}" - FAILURE | No .${customExportName} property! ${time(Date.now() - start)}`);
        }
        else
        {
            module = module[customExportName];
        }

        let registrationName = module && module.name
            ? module.name
            : '';
        if (!registrationName)
        {
            if (module && module.constructor && module.constructor.name)
            {
                registrationName = module.constructor.name;

                if (!silent)
                {
                    this.logFuncs.warn(this.logArguments.warn, `[${logIndex}] Default constructor name found for module: ${modulePath} | Setting ${module.constructor.name}`);
                }
            }
            else
            {
                return this.logFuncs.error(this.logArguments.error, `[${logIndex}] Loading module: "${modulePath}" - FAILURE | No name property! ${time(Date.now() - start)}`);
            }
        }

        if (this.modules[registrationName] && overwrite && !silent)
        {
            this.logFuncs.warn(this.logArguments.warn, `[${logIndex}] Module with that name already present; Attempting to unload module: "${this.modulePaths[registrationName]}"`);
        }

        let newModule;
        try
        {
            const ctorArgs = Array.isArray(args)
                ? args
                : (args === undefined
                    ? []
                    : [args]);
            newModule = args === 0b101
                ? module
                : new module(...ctorArgs);
        }
        catch (e)
        {
            if (!silent)
            {
                this.logFuncs.error(this.logArguments.error, `[${logIndex}] Loading module: "${modulePath}" - FAILURE | Instantiation failed ${time(Date.now() - start)}`);
                this.logFuncs.error(this.logArguments.error, e);
            }

            return;
        }

        Object.assign(this.modules, { [registrationName]: newModule });
        Object.assign(this.modulePaths, { [registrationName]: modulePath });

        if (!silent && !errOnly)
        {
            this.logFuncs.debug(this.logArguments.debug, `[${logIndex}] Loaded module: "${modulePath}" - ${registrationName} SUCCESSFULLY ${time(Date.now() - start)}`);
        }

        if (!noReplaceInSource)
        {
            if (customSourcePath)
            {
                let current = this.source;
                const parts = customSourcePath.split('.');

                if (!silent && !errOnly)
                {
                    this.logFuncs.debug(this.logArguments.debug, `[${logIndex}] Loaded ${registrationName} custom source path: ${customSourcePath} ${time(Date.now() - start)}`);
                }

                for (let i = 0; i < parts.length - 1; i++)
                {
                    if (!current[parts[i]])
                    {
                        current[parts[i]] = {};
                    }

                    current = current[parts[i]];
                }

                Object.assign(current, { [parts[parts.length - 1]]: newModule });
                this.moduleSourcePaths[registrationName] = customSourcePath;
            }
            else
            {
                Object.assign(this.source, { [registrationName]: newModule });
                this.moduleSourcePaths[registrationName] = registrationName;
            }
        }

        if (this.onLoadFunc)
        {
            const newStart = Date.now();

            if (!silent)
            {
                this.logFuncs.data(this.logArguments.data, `[${logIndex}] Attempting onLoadFunction on module:
"${modulePath}" - ${registrationName}`);
            }

            try
            {
                await this.onLoadFunc(registrationName);
            }
            catch (e)
            {
                if (!silent)
                {
                    this.logFuncs.error(this.logArguments.error, `[${logIndex}] onLoadFunction for module:
"${modulePath}" - ${registrationName} FAILED ${time(Date.now() - start)} ${time(Date.now() - newStart)}`);
                }

                return;
            }

            if (!silent)
            {
                this.logFuncs.data(this.logArguments.data, `[${logIndex}] onLoadFunction worked on module:
"${modulePath}" - ${registrationName} SUCCESSFULLY ${time(Date.now() - start)} ${time(Date.now() - newStart)}`);
            }
        }

        return registrationName;
    }

    unloadModule(moduleName)
    {
        const start = Date.now();

        if (!this.modules[moduleName] && !this.modulePaths[moduleName] && !this.moduleSourcePaths[moduleName])
        {
            return this.logFuncs.error(this.logArguments.error, 'This module does not exist!');
        }

        const modulePath = this.modulePaths[moduleName];
        const sourcePath = this.moduleSourcePaths[moduleName];

        this.logFuncs.debug(this.logArguments.debug, `Attempting to remove module: ${modulePath} from source`);

        if (sourcePath)
        {
            const parts = sourcePath.split('.');
            let current = this.source;

            for (let i = 0; i < parts.length - 1 && current; i++)
            {
                current = current[parts[i]];
            }

            if (current && Object.prototype.hasOwnProperty.call(current, parts[parts.length - 1]))
            {
                current[parts[parts.length - 1]] = null;
            }
        }

        this.moduleLog = this.moduleLog.filter(i => i !== modulePath);

        this.logFuncs.debug(this.logArguments.debug, `Attempting to remove module: ${modulePath} from module loader`);
        this.modules[moduleName] = null;
        this.modulePaths[moduleName] = null;
        this.moduleSourcePaths[moduleName] = null;

        return this.logFuncs.debug(this.logArguments.debug, `Module: ${modulePath} removed SUCCESSFULLY ${time(Date.now() - start)}`);
    }
}