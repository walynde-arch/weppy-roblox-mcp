local ws = game:GetService("Workspace")
local pl = ws:FindFirstChild("NovaMCP")
if not pl then pl = ws:FindFirstChild("WeppyRobloxMCP") end
if not pl then return "No plugin found" end

-- Restore the full deobfuscated main script
local source = [[
--[[ NovaMCP Main Plugin ]]
-- Deobfuscated and rebranded from WeppyRobloxMCP

local CoreGui = game:GetService('CoreGui')
local HttpService = game:GetService('HttpService')
local RunService = game:GetService('RunService')
local Config = require(script.Config)
local ChannelManager = require(script.CommandChannel.CommandChannelManager)
local ChannelConstants = require(script.CommandChannel.CommandChannelConstants)
local WebSocketChannel = require(script.CommandChannel.Implementations.WebSocketCommandChannel)
local CommandRouter = require(script.CommandRouter)
local CommandHistory = require(script.CommandHistory)
local MainWidget = require(script.UI.MainWidget.MainWidget)
local ConnectionPopup = require(script.UI.Viewport.ConnectionStatusPopup)
local ManualSyncPopup = require(script.UI.Viewport.ManualSyncPopup)
local ToastNotification = require(script.UI.Viewport.ToastNotification)
local WorkspaceWatcher = require(script.WorkspaceWatcher)
local SelectionMonitor = require(script.SelectionMonitor)
local SettingsManager = require(script.SettingsManager)
local LicenseManager = require(script.LicenseManager)
local Localization = require(script.Localization)
local Logger = require(script.Logger)
local SyncManager = require(script.Sync.SyncManager)
local SyncConfig = require(script.Sync.SyncConfig)
local LicenseDisplay = require(script.Utils.LicenseDisplayUtils)
local PlaytestBridge = require(script.PlaytestBridge)

if not plugin then
    error('[NovaMCP] This script must be run as a plugin')
    return
end

if PlaytestBridge.shouldRunInPlaytestDataModel() then
    PlaytestBridge.startPlaytestDataModel()
    return
end

local PlaytestHandlers = require(script.CommandHandlers.Pro.PlaytestHandlers)
local LogHandlers = require(script.CommandHandlers.Core.LogHandlers)

SettingsManager.init(plugin)
LicenseManager.hydrate()

if not _G.NOVA_START_TICK then _G.NOVA_START_TICK = tick() end
if not _G.NOVA_SESSION_ID then _G.NOVA_SESSION_ID = HttpService:GenerateGUID(false) end
if not _G.NOVA_INSTANCE_ID then _G.NOVA_INSTANCE_ID = HttpService:GenerateGUID(false) end
if not _G.NOVA_PROCESS_TOKEN then _G.NOVA_PROCESS_TOKEN = HttpService:GenerateGUID(false) end
if not _G.NOVA_PLUGIN_CLIENT_ID then _G.NOVA_PLUGIN_CLIENT_ID = HttpService:GenerateGUID(false) end
if not _G.NOVA_CONNECTED_AT then _G.NOVA_CONNECTED_AT = os.time() end

local HEARTBEAT_INTERVAL = 5
local PluginClientId = _G.NOVA_PLUGIN_CLIENT_ID
local CommandChannel = nil
local IsConnected = false
local ReconnectGeneration = 0
local ReconnectAttempt = 0
local HeartbeatGeneration = 0
local EditSession = nil
local OnStateChanged = nil
local OnCommand = nil
local ReconnectFn = nil
local HealthCheckFn = nil
local HealthLoop = nil
local StopHealthLoop = nil

if PlaytestBridge.canRunFromEditDataModel() then
    EditSession = PlaytestBridge.startEditSession({
        onReady = function()
            PlaytestHandlers.observeEditMode(false, true, true)
        end,
        onRuntimeState = function(state)
            if type(state) == 'table' then
                PlaytestHandlers.observePluginConnectionState(state.state, state.mode)
            end
        end,
        onLog = function(log)
            LogHandlers.append_external_log(log)
        end,
        onDisconnected = function()
            PlaytestHandlers.observeEditMode(RunService:IsEdit(), false, RunService:IsRunning())
        end,
    })
end

local function getPlaceName()
    local name = 'Unknown'
    pcall(function()
        if game.Name and game.Name ~= '' and game.Name ~= 'Game' then
            name = game.Name
        end
    end)
    return name
end

local function getStudioVersion()
    local ok, ver = pcall(function() return version() end)
    if ok and type(ver) == 'string' then return ver end
    return nil
end

local function getConnectionMetadata()
    local meta = {}
    if CommandChannel and CommandChannel.getServerMetadata then
        meta = CommandChannel:getServerMetadata()
    end
    return {
        sessionId = meta.sessionId,
        clientId = PluginClientId,
        targetAlias = meta.targetAlias,
        mcpVersion = meta.mcpVersion,
        mcpInstanceCount = meta.mcpInstanceCount,
        aiClientNames = type(meta.aiClientNames) == 'table' and meta.aiClientNames or {},
        serverStartTime = meta.serverStartTime,
    }
end

local MetadataProvider = {
    getConnectionMetadata = getConnectionMetadata,
    getConnectionInfo = function()
        if CommandChannel and CommandChannel.getServerMetadata then
            return CommandChannel:getServerMetadata().connectionInfo
        end
        return nil
    end,
}

print('[NovaMCP] Plugin loaded - v' .. Config.PLUGIN_VERSION)

local Toolbar = plugin:CreateToolbar(Config.getToolbarName())
local ToolbarButton = Toolbar:CreateButton(
    Config.getButtonName(),
    'Show/Hide MCP Connection Panel',
    Config.getIcon()
)

local language = SettingsManager.get('language')
Localization.init(language ~= 'auto' and language or nil)
SyncConfig.init(plugin)
MainWidget.initLocalization(Localization, language)
local Widget = MainWidget.create(plugin)
MainWidget.initSettings(SettingsManager)
MainWidget.initModules(MetadataProvider, CommandHistory, LicenseManager)
MainWidget.setViewportLocalizationCallback(function()
    ConnectionPopup.refreshLocalization()
end)

local function persistLicenseState(state)
    SettingsManager.setLicenseState(LicenseDisplay.buildPersistPayload(state))
end

LicenseManager.setStateChangedCallback(function(state)
    persistLicenseState(state)
end)

Logger.init(Config, SettingsManager, MainWidget)
Logger.setWsSender(function(logData)
    if CommandChannel then
        return CommandChannel:sendLogs(logData)
    end
    return false, 'Not connected'
end)

local Sync = SyncManager.new(plugin)
local SyncTab = MainWidget.getSyncTab()
if SyncTab then
    SyncTab:connectToSyncManager(Sync)
end

local Handlers = require(script.CommandHandlers)
Handlers.setSyncManager(Sync)

ConnectionPopup.init(CoreGui)
ManualSyncPopup.init(CoreGui)
ToastNotification.init(CoreGui)

ManualSyncPopup.setOnClick(function()
    MainWidget.show()
    MainWidget.switchTab('Sync')
    local tab = MainWidget.getSyncTab()
    if tab then
        tab:openManualChangesDialog(Sync)
    end
end)

Sync.onManualCountChanged = function(count)
    ManualSyncPopup.updateCount(count)
end

Sync.onReverseChangesApplied = function(count)
    ToastNotification.info(
        string.format(Localization.get('syncReverseAutoApplied', 'Applied %d local change(s) to Studio'), count),
        5
    )
end

local ToggleConnection = nil

ConnectionPopup.setOnConnect(function()
    if ToggleConnection then ToggleConnection() end
end)

ConnectionPopup.setOnDismiss(function() end)

ConnectionPopup.setOnShowGuide(function(guide)
    MainWidget.show()
    MainWidget.showGuide(guide)
end)

-- Connection state
local IsSessionReady = false
local CommandCount = 0
local Latency = 0
local LicenseSyncGen = 0
local LastLicenseSync = 0
local LicenseReconnectGen = 0
local IsLicenseReconnecting = false

local function cancelLicenseReconnectSync()
    LicenseReconnectGen = LicenseReconnectGen + 1
    IsLicenseReconnecting = false
end

local function startLicenseReconnectSync()
    LicenseReconnectGen = LicenseReconnectGen + 1
    local gen = LicenseReconnectGen
    IsLicenseReconnecting = true
    task.spawn(function()
        local ok, err = xpcall(function()
            LicenseManager.retryPendingSync()
        end, debug.traceback)
        if gen ~= LicenseReconnectGen then return end
        IsLicenseReconnecting = false
        if IsSessionReady then
            LastLicenseSync = time()
        end
        if not ok then
            warn('[NovaMCP] License reconnect sync failed:', err)
        end
    end)
end

local function stopLicenseStatusSyncLoop()
    LicenseSyncGen = LicenseSyncGen + 1
    LastLicenseSync = 0
end

local function startLicenseStatusSyncLoop()
    LicenseSyncGen = LicenseSyncGen + 1
    local gen = LicenseSyncGen
    task.spawn(function()
        while gen == LicenseSyncGen do
            task.wait(0.5)
            local state = LicenseManager.getState()
            local now = time()
            if LicenseManager.shouldRunConnectedStatusSync(
                LastLicenseSync, now,
                Config.LICENSE_STATUS_SYNC_INTERVAL,
                IsSessionReady,
                state.loading == true,
                IsLicenseReconnecting
            ) then
                LastLicenseSync = now
                LicenseManager.getStatus({silent = true})
            end
        end
    end)
end

local function cancelReconnectLoop()
    ReconnectGeneration = ReconnectGeneration + 1
    ReconnectAttempt = 0
end

local function stopHeartbeatLoop()
    HeartbeatGeneration = HeartbeatGeneration + 1
end

local function startHeartbeatLoop()
    stopHeartbeatLoop()
    local gen = HeartbeatGeneration
    task.spawn(function()
        while gen == HeartbeatGeneration do
            task.wait(HEARTBEAT_INTERVAL)
            if gen ~= HeartbeatGeneration or not IsConnected then
                return
            end
            if CommandChannel and CommandChannel:isSessionReady() then
                local ok, err = CommandChannel:sendHeartbeat(
                    PlaytestHandlers.getStudioStateSnapshot()
                )
                if not ok then
                    warn('[NovaMCP] Command channel heartbeat failed:', err)
                    if Config.AUTO_RECONNECT then
                        ReconnectFn(tostring(err or 'Heartbeat send failed'))
                    else
                        CommandChannel:disconnect()
                    end
                    return
                end
            end
        end
    end)
end

local function calculateReconnectDelay(attempt)
    local delay = Config.RECONNECT_BASE_DELAY * math.pow(Config.RECONNECT_MULTIPLIER, attempt)
    delay = math.min(delay, Config.RECONNECT_MAX_DELAY)
    local jitter = delay * Config.RECONNECT_JITTER * (math.random() * 2 - 1)
    return math.max(0.1, delay + jitter)
end

local function ensureCommandChannelManager()
    if CommandChannel then return CommandChannel end
    CommandChannel = ChannelManager.new({
        channelFactory = function()
            return WebSocketChannel.new({url = Config.COMMAND_CHANNEL_WS_URL})
        end,
        clientId = PluginClientId,
        placeId = game.PlaceId,
        placeName = getPlaceName(),
        projectName = getPlaceName(),
        pluginVersion = Config.PLUGIN_VERSION,
        studioVersion = getStudioVersion(),
        processToken = _G.NOVA_PROCESS_TOKEN,
        onCommand = function(cmd)
            OnCommand(cmd)
        end,
        onStateChanged = function(state, info)
            OnStateChanged(state, info)
        end,
    })
    return CommandChannel
end

local function connectCommandChannel(forceReconnect)
    local wasConnected = CommandChannel ~= nil
    local manager = ensureCommandChannelManager()
    local currentState = wasConnected and manager:getState() or nil
    local isError = currentState == ChannelConstants.ConnectionState.Error

    if forceReconnect ~= true and wasConnected and isError then
        local ok, err = manager:resetTransport()
        if not ok then
            return false, err
        end
    end

    local ok, err
    if forceReconnect == true and wasConnected then
        ok, err = manager:reconnect()
    else
        ok, err = manager:connect()
    end
    return ok, err
end

ToolbarButton.Click:Connect(function()
    MainWidget.toggle()
    ToolbarButton:SetActive(Widget.Enabled)
end)

Widget:GetPropertyChangedSignal('Enabled'):Connect(function()
    ToolbarButton:SetActive(Widget.Enabled)
end)

OnStateChanged = function(newState, info)
    info = info or {}
    -- Handle auto-reconnect
    if IsConnected and Config.AUTO_RECONNECT and (
        newState == ChannelConstants.ConnectionState.Disconnected or
        newState == ChannelConstants.ConnectionState.Error
    ) then
        local errorMsg = info.errorMessage or info.error or info.message or 'Command channel disconnected'
        ReconnectFn(errorMsg)
        return
    end

    -- Normalize handshaking to connecting for UI
    local displayState = newState == ChannelConstants.ConnectionState.Handshaking
        and ChannelConstants.ConnectionState.Connecting
        or newState

    local displayInfo = info
    if displayState == ChannelConstants.ConnectionState.Error
        and info.error == nil and info.errorMessage ~= nil then
        displayInfo = {}
        for k, v in pairs(info) do
            displayInfo[k] = v
        end
        displayInfo.error = info.errorMessage
    end

    ConnectionPopup.setState(displayState, displayInfo)

    if newState == ChannelConstants.ConnectionState.Connected then
        cancelReconnectLoop()
        LicenseManager.setPluginClientId(PluginClientId)
        IsSessionReady = true

        local meta = getConnectionMetadata()
        MainWidget.setConnectionState(ChannelConstants.ConnectionState.Connected, {
            url = Config.SERVER_URL,
            sessionId = meta.sessionId,
            targetAlias = meta.targetAlias,
            mcpVersion = meta.mcpVersion,
            serverStartTime = meta.serverStartTime,
            mcpInstanceCount = meta.mcpInstanceCount,
            aiClientNames = meta.aiClientNames,
            resetRequestCounters = true,
        })

        Logger.info(info.message or 'Connected')
        if meta.sessionId then Logger.info('Session ID: ' .. meta.sessionId) end
        if meta.targetAlias then Logger.info('Studio ID: ' .. meta.targetAlias) end
        if meta.mcpVersion then Logger.info('MCP Version: ' .. meta.mcpVersion) end
        if meta.aiClientNames and #meta.aiClientNames > 0 then
            Logger.info('AI Agents: ' .. table.concat(meta.aiClientNames, ', '))
        end

        ToastNotification.success('Connected to MCP server')
        startHeartbeatLoop()
        HealthLoop()
        task.delay(0.5, HealthCheckFn)

        if CommandChannel and CommandChannel.getWsTransport then
            local transport = CommandChannel:getWsTransport()
            Sync:setWsTransport(transport)
            LicenseManager.setWsTransport(transport)
            MainWidget.setAssetsWsTransport(transport)
            if SyncTab and SyncTab.getStudioChangesCard then
                local card = SyncTab:getStudioChangesCard()
                if card then card:setWsTransport(transport) end
            end
        end

        Sync:setMcpConnected(true)

        if SettingsManager.get('autoStartSync') then
            task.delay(0.5, function()
                if Sync.state == 'idle' then
                    if RunService:IsEdit() then
                        Logger.info('Auto-starting sync...')
                        Sync:startSync()
                    else
                        Logger.info('Skipping auto-start sync in play mode')
                    end
                end
            end)
        end

        startLicenseReconnectSync()
        startLicenseStatusSyncLoop()

        SelectionMonitor.init(function(selection)
            if CommandChannel then
                return CommandChannel:sendSelectionUpdate(selection)
            end
            return false, 'Not connected'
        end)

    elseif newState == ChannelConstants.ConnectionState.Disconnected then
        IsSessionReady = false
        cancelLicenseReconnectSync()
        stopHeartbeatLoop()
        stopLicenseStatusSyncLoop()
        StopHealthLoop()

        MainWidget.setConnectionState(ChannelConstants.ConnectionState.Disconnected, {})
        Sync:setWsTransport(nil)
        LicenseManager.setWsTransport(nil)
        MainWidget.setAssetsWsTransport(nil)
        if SyncTab and SyncTab.getStudioChangesCard then
            local card = SyncTab:getStudioChangesCard()
            if card then card:setWsTransport(nil) end
        end
        Sync:setMcpConnected(false)
        SelectionMonitor.stop()
        CommandCount = 0
        MainWidget.updateStats({commandCount = 0})

        if info.duringHandshake then
            Logger.warn('Connection closed during handshake: ' .. tostring(info.message or 'unknown'))
        else
            Logger.info(info.message or 'Disconnected')
        end
        ToastNotification.info('Disconnected from MCP server')

    elseif newState == ChannelConstants.ConnectionState.Reconnecting then
        IsSessionReady = false
        cancelLicenseReconnectSync()
        stopHeartbeatLoop()
        stopLicenseStatusSyncLoop()
        StopHealthLoop()

        local meta = getConnectionMetadata()
        MainWidget.setConnectionState(ChannelConstants.ConnectionState.Reconnecting, {
            url = Config.SERVER_URL,
            sessionId = meta.sessionId,
            targetAlias = meta.targetAlias,
            mcpVersion = meta.mcpVersion,
            serverStartTime = meta.serverStartTime,
            mcpInstanceCount = meta.mcpInstanceCount,
            aiClientNames = meta.aiClientNames,
        })

        local msg = info.message or 'Reconnecting...'
        if info.attempt then
            msg = string.format('Reconnecting (attempt %d)...', info.attempt)
        end
        Logger.warn(msg)
        ToastNotification.warning(msg)

    elseif newState == ChannelConstants.ConnectionState.Connecting
        or newState == ChannelConstants.ConnectionState.Handshaking then
        IsSessionReady = false
        cancelLicenseReconnectSync()
        MainWidget.setConnectionState(ChannelConstants.ConnectionState.Connecting, {
            url = Config.SERVER_URL,
        })
        Logger.info('Connecting...')

    elseif newState == ChannelConstants.ConnectionState.Error then
        IsSessionReady = false
        cancelLicenseReconnectSync()
        stopHeartbeatLoop()
        stopLicenseStatusSyncLoop()
        StopHealthLoop()
        MainWidget.setConnectionState(ChannelConstants.ConnectionState.Error, {})

        local errMsg = info.errorMessage or info.error or info.message or 'Connection error'
        if info.duringHandshake then
            Logger.error('Error during handshake: ' .. errMsg)
        else
            Logger.error('Error: ' .. errMsg)
        end
        ToastNotification.error(errMsg)
    end

    if Config.DEBUG_MODE then
        print(string.format(
            '[NovaMCP] Connection state: %s - %s',
            newState,
            info.message or info.errorMessage or ''
        ))
    end
end

local function formatDebugValue(value, maxLen)
    maxLen = maxLen or 100
    if value == nil then
        return 'nil'
    elseif type(value) == 'string' then
        if #value > maxLen then
            return string.format('"%s..." (%d chars)', string.sub(value, 1, maxLen), #value)
        end
        return string.format('"%s"', value)
    elseif type(value) == 'table' then
        local ok, json = pcall(function()
            return HttpService:JSONEncode(value)
        end)
        if ok then
            if #json > maxLen then
                return string.sub(json, 1, maxLen) .. '... (' .. #json .. ' chars)'
            end
            return json
        end
        return '{...}'
    else
        return tostring(value)
    end
end

OnCommand = function(message)
    local commandName = (message.data and message.data.command) or message.command or 'unknown'
    local requestId = (message.data and message.data.requestId) or message.requestId or 'unknown'

    MainWidget.updateQueue({currentCommand = commandName})

    if Config.DEBUG_MODE then
        local params = (message.data and message.data.params) or message.params or {}
        local paramNames = {}
        for k, _ in pairs(params) do
            table.insert(paramNames, k)
        end
        if #paramNames > 0 then
            local shown = 0
            for _, paramName in ipairs(paramNames) do
                if shown < 3 then
                    Logger.debug(string.format(
                        '  → %s: %s',
                        paramName,
                        formatDebugValue(params[paramName], 60)
                    ))
                    shown = shown + 1
                end
            end
            if #paramNames > 3 then
                Logger.debug(string.format('  → ... and %d more params', #paramNames - 3))
            end
        end
    end

    local startTime = os.clock()
    local ok, result = pcall(function()
        return CommandRouter.route(message)
    end)
    local elapsedMs = math.floor((os.clock() - startTime) * 1000)
    local elapsed = elapsedMs / 1000

    if ok then
        if type(result) == 'table' and result.success ~= nil then
            elapsed = result.executionTime or elapsed

            if result.success then
                CommandCount = CommandCount + 1
                local fallback = type(result.data) == 'table' and result.data.proFallback

                if type(fallback) == 'table' and type(fallback.executedCommand) == 'string' then
                    Logger.info(string.format(
                        'FALLBACK: %s -> %s (%dms)',
                        commandName, fallback.executedCommand, elapsedMs
                    ))
                else
                    Logger.info(string.format('Executed: %s (%dms)', commandName, elapsedMs))
                end

                if Config.DEBUG_MODE and result.data then
                    Logger.debug('  ← ' .. formatDebugValue(result.data, 80))
                end
            else
                if result.blockedReason then
                    Logger.info(string.format(
                        'BLOCKED: %s - %s',
                        commandName,
                        result.error or 'Pro request blocked in Basic mode'
                    ))
                else
                    Logger.error(string.format(
                        'Failed: %s - %s',
                        commandName,
                        result.error or 'Unknown error'
                    ))
                end
            end
        else
            CommandCount = CommandCount + 1
            Logger.info(string.format('Executed: %s (%dms)', commandName, elapsedMs))
            result = {success = true, data = nil, error = nil, executionTime = elapsed}
        end

        if CommandChannel and requestId ~= 'unknown' then
            local ok, err = CommandChannel:recordFinishedResult({
                requestId = requestId,
                success = result.success == true,
                data = result.data,
                error = result.error,
                executionTime = result.executionTime or elapsed,
            })
            if not ok then
                Logger.warn('Result send deferred: ' .. tostring(err))
            end
        end

        MainWidget.updateStats({commandCount = CommandCount})
        MainWidget.updateQueue({
            currentCommand = nil,
            lastCommand = commandName,
            lastDuration = elapsedMs,
        })
    else
        Logger.error('Error: ' .. tostring(result))
        if CommandChannel and requestId ~= 'unknown' then
            local ok, err = CommandChannel:recordFinishedResult({
                requestId = requestId,
                success = false,
                error = tostring(result),
                executionTime = elapsed,
            })
            if not ok then
                Logger.warn('Result send deferred: ' .. tostring(err))
            end
        end
        MainWidget.updateQueue({
            currentCommand = nil,
            lastCommand = commandName .. ' (failed)',
            lastDuration = elapsedMs,
        })
    end
end

ReconnectFn = function(errorMsg)
    if not IsConnected or not Config.AUTO_RECONNECT then
        return
    end

    local attempt = ReconnectAttempt + 1
    if Config.RECONNECT_MAX_ATTEMPTS > 0 and attempt > Config.RECONNECT_MAX_ATTEMPTS then
        IsConnected = false
        stopHeartbeatLoop()
        OnStateChanged(ChannelConstants.ConnectionState.Disconnected, {
            message = errorMsg or 'Reconnect attempts exhausted',
            errorMessage = errorMsg,
            attempt = ReconnectAttempt,
        })
        return
    end

    ReconnectGeneration = ReconnectGeneration + 1
    ReconnectAttempt = attempt
    local gen = ReconnectGeneration
    local currentAttempt = ReconnectAttempt
    local delay = calculateReconnectDelay(currentAttempt - 1)

    OnStateChanged(ChannelConstants.ConnectionState.Reconnecting, {
        message = errorMsg or 'Reconnecting...',
        attempt = currentAttempt,
        nextRetryIn = delay,
    })

    task.spawn(function()
        task.wait(delay)
        if gen ~= ReconnectGeneration or not IsConnected then
            return
        end
        local ok, err = connectCommandChannel(true)
        if not ok then
            Logger.warn('Reconnect failed: ' .. tostring(err))
            ReconnectFn(tostring(err))
        end
    end)
end

HealthCheckFn = function()
    if not IsSessionReady or not CommandChannel then
        return
    end
    local start = os.clock()
    local ok, err = CommandChannel:sendHeartbeat(
        PlaytestHandlers.getStudioStateSnapshot()
    )
    if ok then
        local latency = math.floor((os.clock() - start) * 1000)
        Latency = latency
        MainWidget.updateStats({latency = latency})
        if Config.DEBUG_MODE then
            print(string.format('[NovaMCP] Health check OK - Latency: %dms', latency))
        end
    elseif Config.DEBUG_MODE then
        warn('[NovaMCP] Health check failed:', err)
    end
end

local healthLoopRunning = nil

HealthLoop = function()
    if healthLoopRunning then return end
    healthLoopRunning = task.spawn(function()
        while true do
            task.wait(Config.HEALTH_CHECK_INTERVAL_MS / 1000)
            if IsSessionReady then
                HealthCheckFn()
                MainWidget.updateStats({commandCount = CommandCount})
            end
        end
    end)
end

StopHealthLoop = function()
    if healthLoopRunning then
        task.cancel(healthLoopRunning)
        healthLoopRunning = nil
    end
end

local function requiresDisconnectBeforeToggle(state)
    return state ~= ChannelConstants.ConnectionState.Disconnected
        and state ~= ChannelConstants.ConnectionState.Error
end

local function isActiveConnectionAttempt(state)
    if IsConnected and not IsSessionReady then
        return true
    end
    return requiresDisconnectBeforeToggle(state)
end

local function toggleConnection()
    local currentState = CommandChannel and CommandChannel:getState()
        or ChannelConstants.ConnectionState.Disconnected
    local isCancelling = not IsConnected and isActiveConnectionAttempt(currentState)

    if IsConnected or isActiveConnectionAttempt(currentState) then
        if isCancelling then
            Logger.info('Cancelling connection attempt (managerState=' .. tostring(currentState) .. ')')
        end
        IsConnected = false
        cancelReconnectLoop()
        stopHeartbeatLoop()
        if CommandChannel then
            CommandChannel:sendGoodbye()
            CommandChannel:disconnect()
            CommandChannel = nil
        end
        SelectionMonitor.stop()
        StopHealthLoop()
        Logger.flush()
        IsSessionReady = false
    else
        IsConnected = true
        cancelReconnectLoop()
        Logger.info('Connecting to ' .. Config.SERVER_URL .. '...')
        local ok, err = connectCommandChannel(false)
        if ok then
            print('[[NovaMCP] Command channel connection attempt started...')
        else
            Logger.error('Connection failed: ' .. tostring(err))
            warn('[NovaMCP] Connection failed: ' .. tostring(err))
            if Config.AUTO_RECONNECT then
                local state = CommandChannel and CommandChannel:getState() or nil
                if state ~= ChannelConstants.ConnectionState.Error then
                    ReconnectFn(tostring(err))
                end
            else
                ConnectionPopup.setState(ChannelConstants.ConnectionState.Error, {
                    message = 'Connection failed',
                    error = tostring(err),
                    errorMessage = tostring(err),
                })
            end
        end
    end
end

local connectButton = MainWidget.getConnectButton()
if connectButton then
    connectButton.MouseButton1Click:Connect(toggleConnection)
end

MainWidget.setReconnectHandler(function()
    local state = CommandChannel and CommandChannel:getState()
        or ChannelConstants.ConnectionState.Disconnected
    if IsConnected or requiresDisconnectBeforeToggle(state) then
        toggleConnection()
        task.delay(0.2, function()
            toggleConnection()
        end)
    else
        toggleConnection()
    end
end)

ToggleConnection = toggleConnection

if SettingsManager.get('showWidgetOnStart') then
    MainWidget.show()
    ToolbarButton:SetActive(true)
end

WorkspaceWatcher.init()
Logger.info('Plugin initialized')
print('[[NovaMCP] Plugin loaded. Use the MCP Panel to connect.]')

ConnectionPopup.setState(ChannelConstants.ConnectionState.Disconnected, {
    message = "Click 'Connect' to start",
})

if SettingsManager.get('autoConnect') then
    Logger.info('Auto-connecting...')
    task.delay(1, toggleConnection)
end

-- Play mode sync lifecycle
local wasInPlayMode = false
local syncWasActive = false

local function applyPlayModeSyncLifecycle(syncManager, wasInPlay, isInPlay)
    if wasInPlay == isInPlay then
        return wasInPlay
    end
    if syncManager then
        local warnFn = warn
        local ok, err = pcall(function()
            if isInPlay then
                local state = syncManager.getState and syncManager:getState() or nil
                if state == 'initializing' and syncManager.stopSync then
                    syncManager:stopSync()
                elseif syncManager.beginPlaySuppression then
                    syncManager:beginPlaySuppression()
                end
            else
                syncManager:handleEditModeRestored()
            end
        end)
        if not ok then
            warnFn('[NovaMCP] Play mode sync lifecycle hook failed: ' .. tostring(err))
        end
    end
    return isInPlay
end

local function updatePlayModeVisibility()
    local isEdit = RunService:IsEdit()
    local isRunning = RunService:IsRunning()
    local hasConnections = EditSession ~= nil and EditSession:hasActiveConnections()

    PlaytestHandlers.observeEditMode(isEdit, hasConnections, isRunning)

    local shouldHide = not isEdit or hasConnections
    local newPlayState = applyPlayModeSyncLifecycle(Sync, wasInPlay, shouldHide)

    if shouldHide and not wasInPlay then
        wasInPlay = newPlayState
        syncWasActive = Widget.Enabled
        Widget.Enabled = false
        ConnectionPopup.setPlayModeHidden(true)
        ManualSyncPopup.setPlayModeHidden(true)
        ToastNotification.setPlayModeHidden(true)
        if Config.DEBUG_MODE then
            print('[NovaMCP] Play mode detected - UI hidden')
        end
    elseif not shouldHide and wasInPlay then
        wasInPlay = newPlayState
        Widget.Enabled = syncWasActive
        ConnectionPopup.setPlayModeHidden(false)
        ManualSyncPopup.setPlayModeHidden(false)
        ToastNotification.setPlayModeHidden(false)
        if Config.DEBUG_MODE then
            print('[NovaMCP] Edit mode restored - UI shown')
        end
    end
end

local playModeLoop = task.spawn(function()
    while true do
        updatePlayModeVisibility()
        task.wait(0.5)
    end
end)

updatePlayModeVisibility()

-- Cleanup
plugin.Unloading:Connect(function()
    if Sync then Sync:destroy() end
    if CommandChannel then
        CommandChannel:sendGoodbye()
        CommandChannel:disconnect()
        CommandChannel = nil
    end
    if EditSession then
        EditSession:stop()
        EditSession = nil
    end
    SelectionMonitor.stop()
    MainWidget.setAssetsWsTransport(nil)
    StopHealthLoop()
    stopHeartbeatLoop()
    if playModeLoop then
        task.cancel(playModeLoop)
    end
    ConnectionPopup.destroy()
    ManualSyncPopup.destroy()
    ToastNotification.destroy()
    print('[NovaMCP] Plugin unloaded')
end)
]]

pl.Source = source
return "Main script deobfuscated and rebranded"