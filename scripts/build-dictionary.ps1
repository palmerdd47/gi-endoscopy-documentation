# Builds data/dictionary.json from the MST 3.0 sheet export in _extract.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$extract = Join-Path $root '_extract'
$outPath = Join-Path $root 'data\dictionary.json'

function Read-Tsv([string]$name) {
  $path = Join-Path $extract $name
  $lines = [System.IO.File]::ReadAllLines($path)
  $rows = New-Object System.Collections.Generic.List[object]
  for ($i = 1; $i -lt $lines.Length; $i++) {
    [void]$rows.Add(@($lines[$i].Split([char]9)))
  }
  return $rows
}

function Cell($row, [int]$index) {
  if ($null -eq $row -or $index -ge $row.Length) { return '' }
  return ([string]$row[$index]).Trim()
}

function New-List {
  return New-Object System.Collections.ArrayList
}

function Add-Unique($list, [string]$value) {
  if ([string]::IsNullOrWhiteSpace($value)) { return }
  if ($value -eq 'v' -or $value -eq 'V') { return }
  foreach ($item in $list) {
    if ($item -eq $value) { return }
  }
  [void]$list.Add($value)
}

function Test-Measurement([string]$value) {
  if ([string]::IsNullOrWhiteSpace($value)) { return $false }
  return $value -match '(?i)(specify|\.\.\.|xx\b|\bmm\b|^ml\b|^#\b|french|classification|relevant structure|size/number|yes/no|n/a)'
}

function Expand-Value([string]$value) {
  $value = $value.Trim()
  if ($value -match '(?i)^yes\s*/\s*no$') { return @('Yes', 'No') }
  if ($value -match '(?i)^type\s+([IVX]+)\s*-\s*([IVX]+)$') {
    $romans = @('I', 'II', 'III', 'IV', 'V')
    $start = [array]::IndexOf($romans, $Matches[1].ToUpper())
    $end = [array]::IndexOf($romans, $Matches[2].ToUpper())
    if ($start -ge 0 -and $end -ge $start) {
      return @($romans[$start..$end] | ForEach-Object { "Type $_" })
    }
  }
  if ($value -match '^(\d+)\s*-\s*(\d+)$') {
    $a = [int]$Matches[1]
    $b = [int]$Matches[2]
    if ($b -ge $a -and ($b - $a) -le 12) {
      $nums = New-List
      for ($n = $a; $n -le $b; $n++) { [void]$nums.Add("$n") }
      return @($nums)
    }
  }
  return @($value)
}

function Convert-AttributeValues($rawValues) {
  $choices = New-List
  $hints = New-List
  foreach ($raw in @($rawValues)) {
    foreach ($value in @(Expand-Value $raw)) {
      if (Test-Measurement $value) { Add-Unique $hints $value } else { Add-Unique $choices $value }
    }
  }
  $specify = ($choices.Count -eq 0 -and $hints.Count -gt 0)
  return @{
    values = @($choices)
    hints = @($hints)
    specify = [bool]$specify
  }
}

function Normalize-Key([string]$value) {
  if ([string]::IsNullOrWhiteSpace($value)) { return '' }
  $text = $value.ToLowerInvariant()
  $text = $text -replace '[\(\)]', ''
  $text = $text -replace '[^\p{L}\p{N}]+', ' '
  $text = $text -replace '\s+', ' '
  return $text.Trim()
}

function Get-TermOrgans($term, $heading, $organIndex, $headingOrgans) {
  $key = Normalize-Key $term
  $aliases = @{
    'compression' = 'extrinsic compression'
    'extrinsic compression' = 'extrinsic compression'
    'sclerosis scarring' = 'scarring'
    'scarring' = 'scarring'
    'pathological vascular pattern' = 'path vascular pattern'
    'path vascular pattern' = 'path vascular pattern'
    'candidosis candidiasis' = 'candidosis'
    'candidosis' = 'candidosis'
    'petechial' = 'petechial'
    'metal clip' = 'metal clip'
    'rubber band' = 'rubber band'
    'hepatic duct anomaly' = 'hepatic duct implant'
  }
  if ($aliases.ContainsKey($key)) { $key = $aliases[$key] }
  if ($organIndex.ContainsKey($key)) { return @($organIndex[$key]) }
  if ($headingOrgans -and $headingOrgans.ContainsKey((Normalize-Key $heading))) {
    return @($headingOrgans[(Normalize-Key $heading)])
  }
  return @()
}

function Parse-OrganMatrix($rows, $organNames) {
  $byTerm = @{}
  $byHeading = @{}
  $heading = ''
  foreach ($row in $rows) {
    $c0 = Cell $row 0
    $c1 = Cell $row 1
    if ($c0 -match '(?i)findings|organ|heading|^$') {
      if ($c1 -eq '' -and $c0 -ne '') { continue }
    }
    if ($c0 -ne '' -and $c1 -eq '' -and (Cell $row 2) -eq '') { continue }
    if ($c0 -ne '') { $heading = $c0 }
    $term = $c1
    if ($term -eq '') { continue }
    $organs = New-List
    for ($i = 0; $i -lt $organNames.Count; $i++) {
      $mark = Cell $row ($i + 2)
      if ($mark -match '(?i)^x$') { [void]$organs.Add($organNames[$i]) }
    }
    $byTerm[(Normalize-Key $term)] = @($organs)
    $hKey = Normalize-Key $heading
    if (-not $byHeading.ContainsKey($hKey)) { $byHeading[$hKey] = New-List }
    foreach ($organ in $organs) { Add-Unique $byHeading[$hKey] $organ }
  }
  return @{ byTerm = $byTerm; byHeading = $byHeading }
}

function Parse-FindingCatalog($rows, $organIndex, $headingOrgans) {
  $items = New-List
  $heading = ''
  $current = $null
  $attribute = ''
  foreach ($row in $rows) {
    $c0 = Cell $row 0
    $c1 = Cell $row 1
    $c2 = Cell $row 2
    $c3 = Cell $row 3
    if ($c0 -match '(?i)findings$' -and $c1 -eq '') { continue }
    if ($c0 -eq 'Heading' -or $c1 -eq 'Term') { continue }
    if ($c0 -ne '') {
      $heading = $c0
      $current = $null
      $attribute = ''
    }
    if ($c1 -ne '') {
      $organs = Get-TermOrgans $c1 $heading $organIndex $headingOrgans
      $current = @{
        heading = $heading
        term = $c1
        organs = $organs
        attributes = (New-List)
      }
      [void]$items.Add($current)
      if ($c2 -ne '') {
        $attr = @{ name = $c2; raw = (New-List) }
        [void]$current.attributes.Add($attr)
      } elseif ($c3 -ne '' -and $items.Count -ge 2) {
        $prev = $items[$items.Count - 2]
        if ($prev.heading -eq $heading -and $prev.attributes.Count -gt 0) {
          $carried = $prev.attributes[$prev.attributes.Count - 1].name
          $attr = @{ name = $carried; raw = (New-List) }
          [void]$current.attributes.Add($attr)
        }
      }
    } elseif ($c2 -ne '') {
      if ($null -eq $current) {
        $organs = Get-TermOrgans $heading $heading $organIndex $headingOrgans
        if ($heading -match '(?i)papillary') { $organs = @('Major papilla', 'Minor papilla') }
        $current = @{
          heading = $heading
          term = $heading
          organs = $organs
          attributes = (New-List)
        }
        [void]$items.Add($current)
      }
      $attr = @{ name = $c2; raw = (New-List) }
      [void]$current.attributes.Add($attr)
    }
    if ($c3 -ne '' -and $null -ne $current -and $current.attributes.Count -gt 0) {
      $attr = $current.attributes[$current.attributes.Count - 1]
      [void]$attr.raw.Add($c3)
    }
  }

  $byHeading = @{}
  foreach ($item in $items) {
    if (-not $byHeading.ContainsKey($item.heading)) { $byHeading[$item.heading] = New-List }
    [void]$byHeading[$item.heading].Add($item)
  }
  foreach ($headingName in @($byHeading.Keys)) {
    $group = $byHeading[$headingName]
    $names = @{}
    foreach ($item in $group) {
      foreach ($attr in $item.attributes) { $names[$attr.name] = $true }
    }
    foreach ($name in @($names.Keys)) {
      $owners = New-List
      $union = New-List
      $split = $true
      foreach ($item in $group) {
        foreach ($attr in $item.attributes) {
          if ($attr.name -ne $name) { continue }
          [void]$owners.Add($attr)
          $concrete = 0
          foreach ($value in $attr.raw) {
            if ($value -ne 'v' -and $value -ne 'V') {
              Add-Unique $union $value
              $concrete++
            }
          }
          if ($concrete -gt 1) { $split = $false }
        }
      }
      $measurable = $true
      foreach ($value in $union) { if (-not (Test-Measurement $value)) { $measurable = $false } }
      if ($owners.Count -gt 1 -and $split -and $union.Count -gt 1 -and -not $measurable) {
        foreach ($attr in $owners) { $attr.raw = $union }
      } else {
        foreach ($attr in $owners) {
          $hasDitto = $false
          $own = New-List
          foreach ($value in $attr.raw) {
            if ($value -eq 'v' -or $value -eq 'V') { $hasDitto = $true } else { Add-Unique $own $value }
          }
          if ($hasDitto -and $own.Count -eq 0) { $attr.raw = $union } else { $attr.raw = $own }
        }
      }
    }
  }

  $clean = New-List
  foreach ($item in $items) {
    $attrs = New-List
    foreach ($attr in $item.attributes) {
      $converted = Convert-AttributeValues $attr.raw
      [void]$attrs.Add(@{
        name = $attr.name
        values = $converted.values
        hints = $converted.hints
        specify = [bool]$converted.specify
      })
    }
    [void]$clean.Add(@{
      heading = $item.heading
      term = $item.term
      organs = $item.organs
      attributes = $attrs
    })
  }
  return $clean
}

function Parse-Procedures($rows) {
  $groups = @{ luminal = (New-List); ercp = (New-List); eus = (New-List) }
  $group = ''
  $method = $null
  $attribute = $null
  foreach ($row in $rows) {
    $c0 = Cell $row 0
    $c1 = Cell $row 1
    $c2 = Cell $row 2
    if ($c0 -match '(?i)^PROCEDURES') {
      if ($c0 -match '(?i)ERCP') { $group = 'ercp' }
      elseif ($c0 -match '(?i)EUS') { $group = 'eus' }
      else { $group = 'luminal' }
      $method = $null
      $attribute = $null
      continue
    }
    if ($group -eq '' -or $c0 -eq 'Method') { continue }
    if ($c0 -ne '') {
      $method = @{ method = $c0; attributes = (New-List) }
      [void]$groups[$group].Add($method)
      $attribute = $null
    }
    if ($null -eq $method) { continue }
    if ($c1 -ne '') {
      $attribute = @{ name = $c1.Trim(); raw = (New-List) }
      [void]$method.attributes.Add($attribute)
    }
    if ($c2 -ne '' -and $null -ne $attribute) { Add-Unique $attribute.raw $c2 }
  }
  $out = @{}
  foreach ($key in @('luminal', 'ercp', 'eus')) {
    $methods = New-List
    foreach ($method in $groups[$key]) {
      $attrs = New-List
      foreach ($attr in $method.attributes) {
        $converted = Convert-AttributeValues $attr.raw
        [void]$attrs.Add(@{
          name = $attr.name
          values = @($converted.values)
          hints = @($converted.hints)
          specify = [bool]$converted.specify
        })
      }
      [void]$methods.Add(@{ method = $method.method; attributes = @($attrs) })
    }
    $out[$key] = @($methods)
  }
  return $out
}

function Parse-Reasons($rows) {
  $sections = @{}
  $section = ''
  $category = ''
  foreach ($row in $rows) {
    $c0 = Cell $row 0
    $c1 = Cell $row 1
    $c2 = Cell $row 2
    if ($c0 -match '(?i)REASONS' -or $c0 -eq 'Category') { continue }
    if ($c0 -ne '' -and $c1 -eq '' -and $c2 -eq '') {
      $section = $c0
      if (-not $sections.ContainsKey($section)) { $sections[$section] = New-List }
      $category = ''
      continue
    }
    if ($section -eq '') { continue }
    if ($c0 -ne '') { $category = $c0 }
    if ($category -eq '') { continue }
    $bucket = $null
    foreach ($item in $sections[$section]) {
      if ($item.category -eq $category) { $bucket = $item; break }
    }
    if ($null -eq $bucket) {
      $bucket = @{ category = $category; terms = (New-List); qualifiers = (New-List) }
      [void]$sections[$section].Add($bucket)
    }
    Add-Unique $bucket.terms $c1
    Add-Unique $bucket.qualifiers $c2
  }
  $out = @{}
  foreach ($key in @($sections.Keys)) {
    $cats = New-List
    foreach ($cat in $sections[$key]) {
      [void]$cats.Add(@{ category = $cat.category; terms = @($cat.terms); qualifiers = @($cat.qualifiers) })
    }
    $out[$key] = @($cats)
  }
  return $out
}

function Parse-Diagnoses($rows) {
  $sections = @{}
  $section = ''
  foreach ($row in $rows) {
    $c0 = Cell $row 0
    $c1 = Cell $row 1
    if ($c0 -match '(?i)DIAGNOS') { continue }
    if ($c0 -ne '' -and ($c1 -eq 'Term' -or $c1 -eq '')) {
      if ($c1 -eq 'Term' -or $c0 -cmatch '^[A-Z]') {
        $section = $c0
        if (-not $sections.ContainsKey($section)) { $sections[$section] = New-List }
        continue
      }
    }
    if ($section -ne '' -and $c1 -ne '' -and $c1 -ne 'Term') { Add-Unique $sections[$section] $c1 }
  }
  $out = @{}
  foreach ($key in @($sections.Keys)) { $out[$key] = @($sections[$key]) }
  return $out
}

function Parse-Anatomy($rows) {
  $organs = New-List
  $current = $null
  foreach ($row in $rows) {
    $c0 = Cell $row 0
    $c1 = Cell $row 1
    $c2 = Cell $row 2
    if ($c0 -match '(?i)^ANATOMY$' -or $c0 -eq 'ORGAN') { continue }
    if ($c0 -ne '') {
      $current = @{ organ = $c0; sites = (New-List); modifiers = (New-List) }
      [void]$organs.Add($current)
    }
    if ($null -eq $current) { continue }
    Add-Unique $current.sites $c1
    Add-Unique $current.modifiers $c2
  }
  $out = @{}
  foreach ($organ in $organs) {
    $out[$organ.organ] = @{ sites = @($organ.sites); modifiers = @($organ.modifiers) }
  }
  return $out
}

function Parse-Adverse($rows) {
  $phase = ''
  $events = @{ intraprocedure = (New-List); postprocedure = (New-List) }
  $actions = New-List
  $outcomes = New-List
  $actionComments = @{}
  $currentList = $null
  $event = $null
  $attribute = $null
  $mode = ''
  foreach ($row in $rows) {
    $c0 = Cell $row 0
    $c1 = Cell $row 1
    $c2 = Cell $row 2
    $c3 = Cell $row 3
    if ($c0 -match '(?i)INTRAPROCEDURE') { $phase = 'intraprocedure'; $mode = 'events'; $event = $null; $attribute = $null; continue }
    if ($c0 -match '(?i)POSTPROCEDURE') { $phase = 'postprocedure'; $mode = 'events'; $event = $null; $attribute = $null; continue }
    if ($c0 -match '(?i)ACTIONS AND OUTCOMES') { $mode = 'actions'; $event = $null; $attribute = $null; continue }
    if ($c0 -eq 'Type' -or $c0 -match '(?i)^ADVERSE') { continue }
    if ($mode -eq 'events') {
      if ($c0 -ne '') {
        $event = @{ type = $c0; attributes = (New-List) }
        [void]$events[$phase].Add($event)
        $attribute = $null
      }
      if ($null -eq $event) { continue }
      if ($c1 -ne '') {
        $attribute = @{ name = $c1; raw = (New-List); comment = $c3 }
        [void]$event.attributes.Add($attribute)
      } elseif ($c3 -ne '' -and $null -ne $attribute -and [string]::IsNullOrWhiteSpace($attribute.comment)) {
        $attribute.comment = $c3
      }
      if ($c2 -ne '' -and $null -ne $attribute) { Add-Unique $attribute.raw $c2 }
    } elseif ($mode -eq 'actions') {
      if ($c1 -match '(?i)^actions$') { $currentList = $actions }
      elseif ($c1 -match '(?i)^outcomes$') { $currentList = $outcomes }
      if ($c2 -ne '' -and $null -ne $currentList) {
        Add-Unique $currentList $c2
        if ($c3 -ne '') { $actionComments[$c2] = $c3 }
      }
    }
  }
  function Clean-Events($list) {
    $out = New-List
    foreach ($event in $list) {
      $attrs = New-List
      foreach ($attr in $event.attributes) {
        $useSites = $false
        $raw = New-List
        foreach ($value in @($attr.raw)) {
          if ($value -match '(?i)^main sites$') { $useSites = $true } else { Add-Unique $raw $value }
        }
        $converted = Convert-AttributeValues $raw
        [void]$attrs.Add(@{
          name = $attr.name
          values = @($converted.values)
          hints = @($converted.hints)
          specify = [bool]$converted.specify
          useSites = [bool]$useSites
          comment = $attr.comment
        })
      }
      [void]$out.Add(@{ type = $event.type; attributes = @($attrs) })
    }
    return @($out)
  }
  $commentOut = @{}
  foreach ($key in @($actionComments.Keys)) { $commentOut[$key] = $actionComments[$key] }
  return @{
    intraprocedure = @(Clean-Events $events.intraprocedure)
    postprocedure = @(Clean-Events $events.postprocedure)
    actions = @($actions)
    outcomes = @($outcomes)
    actionComments = $commentOut
  }
}

function Parse-Severity($rows) {
  $levels = @('Incident', 'Mild', 'Moderate', 'Severe', 'Fatal')
  $items = New-List
  foreach ($row in $rows) {
    $outcome = Cell $row 0
    if ($outcome -eq '' -or $outcome -match '(?i)outcome|severity') { continue }
    for ($i = 0; $i -lt $levels.Count; $i++) {
      if ((Cell $row ($i + 1)) -match '(?i)^x$') {
        [void]$items.Add(@{ outcome = $outcome; severity = $levels[$i] })
      }
    }
  }
  return @{ levels = $levels; criteria = @($items) }
}

function Parse-Eus($findingRows, $listRows, $organRows) {
  $organNames = @('Esophagus', 'Stomach', 'Duodenum', 'Pancreas', 'Biliary tree', 'Colorectum')
  $columns = @('Esophagus', 'Stomach', 'Duodenum', 'pancreas', 'biliary tree', 'colorectal')
  $organByTerm = @{}
  foreach ($row in $organRows) {
    $term = Cell $row 0
    if ($term -eq '' -or $term -match '(?i)findings|diagram') { continue }
    $organs = New-List
    for ($i = 0; $i -lt $columns.Count; $i++) {
      if ((Cell $row ($i + 1)) -match '(?i)^x$') { [void]$organs.Add($organNames[$i]) }
    }
    if ($organs.Count -gt 0) { $organByTerm[(Normalize-Key $term)] = @($organs) }
  }

  $findings = @{}
  function Ensure-Finding([string]$name) {
    $key = Normalize-Key $name
    if (-not $findings.ContainsKey($key)) {
      $organs = @()
      if ($organByTerm.ContainsKey($key)) { $organs = @($organByTerm[$key]) }
      $findings[$key] = @{ term = $name; organs = $organs; attributes = @{} }
    }
    return $findings[$key]
  }

  $headers = $null
  $mode = ''
  $seenMarks = $false
  foreach ($row in $findingRows) {
    $c0 = Cell $row 0
    $valueHeader = $c0 -match '(?i)FINDING ATTRIBUTES'
    if ($valueHeader) { $c0 = '' }
    $named = @()
    for ($i = 1; $i -le 16; $i++) {
      $text = Cell $row $i
      if ($text -ne '' -and $text -notmatch '(?i)^\(?cont') { $named += @{ index = $i; name = $text } }
    }
    $xCount = 0
    for ($i = 1; $i -le 16; $i++) { if ((Cell $row $i) -match '(?i)^x$') { $xCount++ } }
    $labelHits = 0
    foreach ($entry in $named) {
      $label = Normalize-Key $entry.name
      if (@('location', 'origin', 'layer origin', 'outer limit', 'size mm', 'shape character', 'margins', 'echofeatures', 'cyst features', 'invasion ext', 'invasion extent', 'invasion into', 't stage', 'n stage', 'degree', 'number', 'duct changes') -contains $label) {
        $labelHits++
      }
    }
    if ($c0 -eq '' -and $labelHits -ge 2 -and $xCount -eq 0) {
      $headers = $named
      if ($seenMarks -or $valueHeader) { $mode = 'values'; $seenMarks = $false } else { $mode = 'marks' }
      continue
    }
    if ($mode -eq 'marks' -and $c0 -ne '' -and $null -ne $headers) {
      $seenMarks = $true
      $finding = Ensure-Finding $c0
      foreach ($header in $headers) {
        if ((Cell $row $header.index) -match '(?i)^x$') {
          if (-not $finding.attributes.ContainsKey($header.name)) {
            $finding.attributes[$header.name] = @{ name = $header.name; raw = (New-List); fromList = $false }
          }
        }
      }
      continue
    }
    if ($mode -eq 'values' -and $null -ne $headers) {
      for ($h = 0; $h -lt $headers.Count; $h++) {
        $header = $headers[$h]
        $value = Cell $row $header.index
        if ($value -eq '' -or $value -match '(?i)^x$') { continue }
        foreach ($key in @($findings.Keys)) {
          $finding = $findings[$key]
          $matched = $null
          if ($finding.attributes.ContainsKey($header.name)) {
            $matched = $finding.attributes[$header.name]
          } else {
            $want = (Normalize-Key $header.name) -replace 'extent', 'ext'
            foreach ($attrKey in @($finding.attributes.Keys)) {
              $have = (Normalize-Key $attrKey) -replace 'extent', 'ext'
              if ($have -eq $want) { $matched = $finding.attributes[$attrKey]; break }
            }
          }
          if ($null -ne $matched -and -not $matched.fromList) { Add-Unique $matched.raw $value }
        }
      }
    }
  }

  # Lesion-specific lists replace the general list when present.
  $listHeader = $null
  $listValues = $null
  foreach ($row in $listRows) {
    $c0 = Cell $row 0
    if ($c0 -match '(?i)ATTRIBUTE LISTS') { continue }
    $valueCells = @()
    for ($i = 1; $i -le 19; $i++) {
      $text = Cell $row $i
      if ($text -ne '') { $valueCells += @{ index = $i; name = $text } }
    }
    $xCount = 0
    for ($i = 1; $i -le 19; $i++) { if ((Cell $row $i) -match '(?i)^x$') { $xCount++ } }
    if ($c0 -ne '' -and $valueCells.Count -ge 2 -and $xCount -eq 0) {
      $listHeader = $c0
      $listValues = $valueCells
      continue
    }
    if ($c0 -ne '' -and $null -ne $listValues -and $xCount -gt 0) {
      $key = Normalize-Key ($c0 -replace '(?i)^pancr\b', 'pancreatic')
      $finding = $null
      if ($findings.ContainsKey($key)) { $finding = $findings[$key] }
      else {
        foreach ($existing in @($findings.Keys)) {
          if ($existing.StartsWith($key) -or $key.StartsWith($existing)) { $finding = $findings[$existing]; break }
        }
      }
      if ($null -eq $finding) { continue }
      $attrName = $listHeader
      if ($attrName -match '(?i)shape') { $attrName = 'shape/character' }
      if (-not $finding.attributes.ContainsKey($attrName)) {
        $finding.attributes[$attrName] = @{ name = $attrName; raw = (New-List); fromList = $true }
      }
      $attr = $finding.attributes[$attrName]
      if (-not $attr.fromList) {
        $attr.raw = New-List
        $attr.fromList = $true
      }
      foreach ($value in $listValues) {
        if ((Cell $row $value.index) -match '(?i)^x$') { Add-Unique $attr.raw $value.name }
      }
    }
  }

  $clean = New-List
  foreach ($key in @($findings.Keys)) {
    $finding = $findings[$key]
    $attrs = New-List
    foreach ($attrName in @($finding.attributes.Keys)) {
      $attr = $finding.attributes[$attrName]
      $useSites = $false
      $raw = New-List
      foreach ($value in @($attr.raw)) {
        if ($value -match '(?i)relevant organ') { $useSites = $true } else { Add-Unique $raw $value }
      }
      if ($attrName -match '(?i)^location$|^origin$|invasion into') { $useSites = $true }
      $converted = Convert-AttributeValues $raw
      [void]$attrs.Add(@{
        name = $attrName
        values = @($converted.values)
        hints = @($converted.hints)
        specify = [bool]($converted.specify -or (@($converted.values).Count -eq 0))
        useSites = [bool]$useSites
      })
    }
    [void]$clean.Add(@{
      term = $finding.term
      organs = @($finding.organs)
      attributes = @($attrs)
    })
  }
  return @($clean)
}

function To-Json($value, [int]$indent) {
  $pad = ' ' * $indent
  $padIn = ' ' * ($indent + 2)
  if ($null -eq $value) { return 'null' }
  if ($value -is [bool]) { if ($value) { return 'true' } else { return 'false' } }
  if ($value -is [string]) { return ($value | ConvertTo-Json -Compress) }
  if ($value -is [int] -or $value -is [long] -or $value -is [double] -or $value -is [decimal]) { return "$value" }
  if ($value -is [System.Collections.IDictionary]) {
    $keys = @($value.Keys)
    if ($keys.Count -eq 0) { return '{}' }
    $lines = New-Object System.Collections.Generic.List[string]
    [void]$lines.Add('{')
    for ($i = 0; $i -lt $keys.Count; $i++) {
      $key = [string]$keys[$i]
      $comma = ''
      if ($i -lt ($keys.Count - 1)) { $comma = ',' }
      [void]$lines.Add($padIn + (To-Json $key 0) + ': ' + (To-Json $value[$key] ($indent + 2)) + $comma)
    }
    [void]$lines.Add($pad + '}')
    return ($lines -join "`n")
  }
  if ($value -is [System.Collections.IEnumerable]) {
    $items = @($value)
    if ($items.Count -eq 0) { return '[]' }
    $lines = New-Object System.Collections.Generic.List[string]
    [void]$lines.Add('[')
    for ($i = 0; $i -lt $items.Count; $i++) {
      $comma = ''
      if ($i -lt ($items.Count - 1)) { $comma = ',' }
      [void]$lines.Add($padIn + (To-Json $items[$i] ($indent + 2)) + $comma)
    }
    [void]$lines.Add($pad + ']')
    return ($lines -join "`n")
  }
  # PSCustomObject
  $props = @($value.PSObject.Properties)
  if ($props.Count -eq 0) { return ($value | ConvertTo-Json -Compress) }
  $map = @{}
  foreach ($prop in $props) { $map[$prop.Name] = $prop.Value }
  return To-Json $map $indent
}

$luminalOrgans = @('Esophagus', 'Stomach', 'Duodenum', 'Jejunum', 'Ileum', 'Colon')
$luminalColumns = @('Esoph', 'Stomach', 'Duod', 'Jej', 'Ileum', 'Colon')
$luminalMatrix = Parse-OrganMatrix (Read-Tsv 'Luminal_findings_organ.csv') $luminalColumns
# The matrix parser stores organs by column label. Remap to full names.
$remap = @{ Esoph = 'Esophagus'; Stomach = 'Stomach'; Duod = 'Duodenum'; Jej = 'Jejunum'; Ileum = 'Ileum'; Colon = 'Colon' }
$luminalByTerm = @{}
foreach ($key in @($luminalMatrix.byTerm.Keys)) {
  $names = New-List
  foreach ($organ in @($luminalMatrix.byTerm[$key])) { if ($remap.ContainsKey($organ)) { Add-Unique $names $remap[$organ] } }
  $luminalByTerm[$key] = @($names)
}
$luminalByHeading = @{}
foreach ($key in @($luminalMatrix.byHeading.Keys)) {
  $names = New-List
  foreach ($organ in @($luminalMatrix.byHeading[$key])) { if ($remap.ContainsKey($organ)) { Add-Unique $names $remap[$organ] } }
  $luminalByHeading[$key] = @($names)
}

$ercpColumns = @('Major papilla', 'Minor papilla', 'Biliary tree', 'Pancreatic duct')
$ercpMatrix = Parse-OrganMatrix (Read-Tsv 'ERCP_findings_organ.csv') @('Maj pap', 'Min pap', 'Bile tree', 'Panc duct')
$ercpRemap = @{ 'Maj pap' = 'Major papilla'; 'Min pap' = 'Minor papilla'; 'Bile tree' = 'Biliary tree'; 'Panc duct' = 'Pancreatic duct' }
$ercpByTerm = @{}
foreach ($key in @($ercpMatrix.byTerm.Keys)) {
  $names = New-List
  foreach ($organ in @($ercpMatrix.byTerm[$key])) { if ($ercpRemap.ContainsKey($organ)) { Add-Unique $names $ercpRemap[$organ] } }
  $ercpByTerm[$key] = @($names)
}
$ercpByHeading = @{}
foreach ($key in @($ercpMatrix.byHeading.Keys)) {
  $names = New-List
  foreach ($organ in @($ercpMatrix.byHeading[$key])) { if ($ercpRemap.ContainsKey($organ)) { Add-Unique $names $ercpRemap[$organ] } }
  $ercpByHeading[$key] = @($names)
}

$anatomy = Parse-Anatomy (Read-Tsv 'Anatomy.csv')
$eusAnatomy = Parse-Anatomy (Read-Tsv 'EUSanatomy.csv')
$reasons = Parse-Reasons (Read-Tsv 'Reasons.csv')
$diagnoses = Parse-Diagnoses (Read-Tsv 'Diagnoses.csv')
$procedures = Parse-Procedures (Read-Tsv 'Procedures.csv')
$adverse = Parse-Adverse (Read-Tsv 'Adv_events.csv')
$severity = Parse-Severity (Read-Tsv 'Adv_event_severity.csv')
$luminalFindings = Parse-FindingCatalog (Read-Tsv 'Luminal_findings.csv') $luminalByTerm $luminalByHeading
$ercpFindings = Parse-FindingCatalog (Read-Tsv 'ERCP_findings.csv') $ercpByTerm $ercpByHeading
foreach ($finding in $ercpFindings) {
  if (@($finding.organs).Count -eq 0) {
    $finding.organs = @('Biliary tree', 'Pancreatic duct')
  }
}
$eusFindings = Parse-Eus (Read-Tsv 'EUS_findings.csv') (Read-Tsv 'EUS_findings_attribute_lists.csv') (Read-Tsv 'EUS_findings_organ.csv')

$dictionary = @{
  source = 'MST 3.0 tables (mst30_tables.xls)'
  procedures = @(
    @{ id = 'EGD'; label = 'Upper endoscopy (EGD)'; family = 'luminal'; organs = @('Esophagus', 'Stomach', 'Duodenum', 'Jejunum'); reasonKey = 'UPPER ENDOSCOPY'; diagnosisKeys = @('UPPER ENDOSCOPY'); interventionKeys = @('luminal'); findingSet = 'luminal' },
    @{ id = 'Enteroscopy'; label = 'Enteroscopy'; family = 'luminal'; organs = @('Esophagus', 'Stomach', 'Duodenum', 'Jejunum', 'Ileum', 'Colon'); reasonKey = 'ENTEROSCOPY'; diagnosisKeys = @('Enteroscopy'); interventionKeys = @('luminal'); findingSet = 'luminal' },
    @{ id = 'VCE'; label = 'Capsule endoscopy'; family = 'luminal'; organs = @('Esophagus', 'Stomach', 'Duodenum', 'Jejunum', 'Ileum', 'Colon'); reasonKey = 'ENTEROSCOPY'; diagnosisKeys = @('Enteroscopy', 'Colonoscopy'); interventionKeys = @('luminal'); findingSet = 'luminal' },
    @{ id = 'Colonoscopy'; label = 'Colonoscopy'; family = 'luminal'; organs = @('Ileum', 'Colon'); reasonKey = 'COLONOSCOPY'; diagnosisKeys = @('Colonoscopy'); interventionKeys = @('luminal'); findingSet = 'luminal' },
    @{ id = 'ERCP'; label = 'ERCP'; family = 'ercp'; organs = @('Esophagus', 'Stomach', 'Duodenum', 'Jejunum', 'Major papilla', 'Minor papilla', 'Biliary tree', 'Pancreatic duct'); reasonKey = 'ERCP'; diagnosisKeys = @('ERCP'); interventionKeys = @('ercp', 'luminal'); findingSet = 'ercp' },
    @{ id = 'EUS'; label = 'EUS'; family = 'eus'; organs = @('Esophagus', 'Stomach', 'Duodenum', 'Pancreas', 'Biliary tree', 'Colorectum'); reasonKey = 'EUS'; diagnosisKeys = @('EUS'); interventionKeys = @('eus'); findingSet = 'eus' }
  )
  anatomy = $anatomy
  eusAnatomy = $eusAnatomy
  eusAnatomyKey = @{
    Esophagus = 'Esophagus'
    Stomach = 'Stomach'
    Duodenum = 'Duodenum'
    Pancreas = 'Pancreas'
    'Biliary tree' = 'Biliary tract'
    Colorectum = 'Colorectum'
  }
  reasons = $reasons
  diagnoses = $diagnoses
  luminalFindings = $luminalFindings
  ercpFindings = $ercpFindings
  eusFindings = $eusFindings
  interventions = $procedures
  adverseEvents = @{
    intraprocedure = $adverse.intraprocedure
    postprocedure = $adverse.postprocedure
  }
  eventActions = $adverse.actions
  eventOutcomes = $adverse.outcomes
  actionComments = $adverse.actionComments
  severity = $severity
}

New-Item -ItemType Directory -Force -Path (Split-Path $outPath) | Out-Null
$json = To-Json $dictionary 0
[System.IO.File]::WriteAllText($outPath, $json + "`n", [System.Text.UTF8Encoding]::new($false))
Write-Output "Wrote $outPath ($($json.Length) chars)"
Write-Output ("luminal findings: " + @($luminalFindings).Count)
Write-Output ("ercp findings: " + @($ercpFindings).Count)
Write-Output ("eus findings: " + @($eusFindings).Count)
Write-Output ("reason sections: " + (@($reasons.Keys) -join ', '))
Write-Output ("diagnosis sections: " + (@($diagnoses.Keys) -join ', '))
