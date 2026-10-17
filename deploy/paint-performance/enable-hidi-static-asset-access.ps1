<#
Azure administrator action only. This script has NOT been applied by Codex.
Default: preview the exact permissions. Use -Apply only after administrator review.
Requires an Azure CLI login with role-definition and role-assignment privileges.
It grants the existing GitHub deployment identity access to Static Web Apps in
rg-hidi-prod; it does not deploy the website or change DNS, API or database settings.
References:
https://learn.microsoft.com/en-us/azure/role-based-access-control/custom-roles-cli
https://learn.microsoft.com/en-us/azure/role-based-access-control/permissions/web-and-mobile
#>
param([switch]$Apply)
$ErrorActionPreference = 'Stop'
$hidiSubscription = '91d9572d-0f0b-47fe-802d-0eef36d7c719'
$hidiTenant = 'e756fdc0-2646-4e94-ac4d-ed7c11f87f34'
$hidiPrincipal = 'de4bbc4e-3303-4c2e-8f75-8eb0c724fc47'
$hidiScope = "/subscriptions/$hidiSubscription/resourceGroups/rg-hidi-prod"
$hidiRoleFile = Join-Path $PSScriptRoot 'hidi-static-asset-publisher-role.json'
$hidiDefinition = Get-Content -LiteralPath $hidiRoleFile -Raw | ConvertFrom-Json
if (-not $Apply) {
    [pscustomobject]@{AssigneeObjectId=$hidiPrincipal; Scope=$hidiScope; Role=$hidiDefinition} | ConvertTo-Json -Depth 8
    Write-Output 'Preview only. No Azure changes made. After administrator review: ./enable-hidi-static-asset-access.ps1 -Apply'
    return
}
function Invoke-HidiAz {
    param([Parameter(ValueFromRemainingArguments=$true)][string[]]$HidiAzArgs)
    $hidiOutput = (& az @HidiAzArgs --only-show-errors --output json) -join "`n"
    if ($LASTEXITCODE -ne 0) { throw 'Azure CLI command failed; no further actions will be taken.' }
    if ($hidiOutput) { $hidiOutput | ConvertFrom-Json }
}
if (-not (Get-Command az -ErrorAction SilentlyContinue)) { throw 'Install Azure CLI and sign in as the authorized Azure administrator first.' }
$hidiAccount = Invoke-HidiAz @('account','show','--subscription',$hidiSubscription)
if ($hidiAccount.id -ne $hidiSubscription -or $hidiAccount.tenantId -ne $hidiTenant) { throw 'Unexpected subscription or tenant; stopping.' }
$hidiProvider = Invoke-HidiAz @('provider','show','--namespace','Microsoft.Web','--subscription',$hidiSubscription)
if ($hidiProvider.registrationState -ne 'Registered') {
    throw "A subscription administrator must first register Microsoft.Web: az provider register --namespace Microsoft.Web --subscription $hidiSubscription --wait"
}
$hidiExisting = @(Invoke-HidiAz @('role','definition','list','--name',$hidiDefinition.Name,'--scope',$hidiScope,'--subscription',$hidiSubscription))
if ($hidiExisting.Count -eq 0) {
    $hidiRole = Invoke-HidiAz @('role','definition','create','--role-definition',$hidiRoleFile,'--subscription',$hidiSubscription)
} else {
    if ($hidiExisting.Count -ne 1) { throw 'Ambiguous custom role; administrator review required.' }
    $hidiRole = $hidiExisting[0]
    if (@($hidiRole.permissions).Count -ne 1) { throw 'Unexpected permission blocks; administrator review required.' }
    $hidiActions = @($hidiRole.permissions[0].actions | Sort-Object)
    if ((Compare-Object $hidiActions @($hidiDefinition.Actions | Sort-Object)) -or @($hidiRole.assignableScopes).Count -ne 1 -or $hidiRole.assignableScopes[0] -ne $hidiScope -or @($hidiRole.permissions[0].dataActions).Count -gt 0 -or @($hidiRole.permissions[0].notActions).Count -gt 0 -or @($hidiRole.permissions[0].notDataActions).Count -gt 0) {
        throw 'An existing role differs from the reviewed permissions; refusing to modify or assign it.'
    }
}
$hidiAssignments = @(Invoke-HidiAz @('role','assignment','list','--scope',$hidiScope,'--role',$hidiRole.name,'--fill-principal-name','false','--subscription',$hidiSubscription) | Where-Object { $_.principalId -eq $hidiPrincipal -and $_.scope -eq $hidiScope })
if ($hidiAssignments.Count -eq 0) {
    $null = Invoke-HidiAz @('role','assignment','create','--assignee-object-id',$hidiPrincipal,'--assignee-principal-type','ServicePrincipal','--role',$hidiRole.name,'--scope',$hidiScope,'--subscription',$hidiSubscription)
}
Write-Output 'Scoped Static Web Apps access is assigned. Allow RBAC propagation, then tell Codex to start a fresh release from the corrected current source. Website, DNS, API and database were not changed by this script.'
