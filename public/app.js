const form = document.querySelector('#downloadForm')
const input = document.querySelector('#videoUrl')
const status = document.querySelector('#status')
const debugOutput = document.querySelector('#debugOutput')
const downloadButton = document.querySelector('#downloadButton')
const backendStatusRoot = document.querySelector('#backendStatus')
const backendStatusText = document.querySelector('#backendStatusText')
const navButtons = document.querySelectorAll('.nav-button')
const sections = document.querySelectorAll('.page-section')
const updatesList = document.querySelector('#updatesList')

function setSection(sectionId) {
  sections.forEach(section => {
    section.classList.toggle('active', section.id === sectionId)
  })
  navButtons.forEach(button => {
    button.classList.toggle('active', button.dataset.target === sectionId)
  })
  window.history.replaceState(null, '', `#${sectionId}`)
}

function loadUpdates() {
  fetch('updates.json')
    .then(response => response.json())
    .then(data => {
      updatesList.innerHTML = data
        .map(
          item =>
            `<div class="update-item"><strong>${item.date}</strong><p>${item.message}</p></div>`
        )
        .join('')
    })
    .catch(() => {
      updatesList.innerHTML = '<div class="update-item">Unable to load updates.</div>'
    })
}

function showMessage(message) {
  status.textContent = message
}

function showDebug(message) {
  debugOutput.textContent = message
}

function setBackendStatus(message, state) {
  backendStatusText.textContent = message
  backendStatusRoot.classList.remove('status-online', 'status-warning', 'status-offline')
  backendStatusRoot.classList.add(`status-${state}`)
}

async function refreshBackendStatus() {
  setBackendStatus('Checking backend...', 'warning')
  try {
    const response = await fetch(`/status?cache=${Date.now()}`)
    if (!response.ok) throw new Error('offline')
    const data = await response.json()
    if (data.status === 'ok') {
      setBackendStatus('Backend online', 'online')
      return true
    }
  } catch (error) {
    setBackendStatus('Backend offline', 'offline')
    return false
  }
  setBackendStatus('Backend offline', 'offline')
  return false
}

async function handleDownload(event) {
  event.preventDefault()
  const url = input.value.trim()
  if (!url) {
    showMessage('Enter a valid YouTube link.')
    return
  }

  showMessage('Checking video and preparing download...')
  showDebug(`Debug URL: /debug?url=${encodeURIComponent(url)}`)
  setBackendStatus('Checking URL...', 'warning')
  downloadButton.disabled = true

  try {
    const response = await fetch(`/debug?url=${encodeURIComponent(url)}`, {
      headers: { Accept: 'application/json' }
    })

    const contentType = response.headers.get('content-type') || ''
    let debugData = null
    let errorText = `HTTP ${response.status} ${response.statusText}`

    if (contentType.includes('application/json')) {
      debugData = await response.json()
    } else {
      const text = await response.text()
      if (text) {
        errorText = text.slice(0, 500)
      }
    }

    if (!response.ok) {
      showMessage('Download failed. See debug output below.')
      if (debugData && debugData.message) {
        showDebug(`Debug error: ${debugData.message}`)
      } else {
        showDebug(`Debug error: ${errorText}`)
      }
      setBackendStatus('Backend error', 'offline')
      downloadButton.disabled = false
      return
    }

    showDebug(`Ready to download: ${debugData?.title || 'unknown'} by ${debugData?.uploader || 'unknown'}`)
    setBackendStatus('Downloading...', 'warning')
    showMessage('Starting download...')

    form.submit()
    setTimeout(() => {
      showMessage('Download request sent. Check your browser downloads.')
      setBackendStatus('Backend online', 'online')
      downloadButton.disabled = false
    }, 1500)
  } catch (error) {
    showMessage('Unable to contact backend. See debug output below.')
    showDebug(`Fetch error: ${error.message}`)
    setBackendStatus('Backend offline', 'offline')
    downloadButton.disabled = false
  }
}

form.addEventListener('submit', handleDownload)

navButtons.forEach(button => {
  button.addEventListener('click', () => {
    setSection(button.dataset.target)
    if (button.dataset.target === 'updates') {
      loadUpdates()
    }
  })
})

const route = window.location.hash.replace('#', '') || 'home'
setSection(route)
if (route === 'updates') {
  loadUpdates()
}

refreshBackendStatus()
setInterval(refreshBackendStatus, 5000)

window.addEventListener('hashchange', () => {
  const next = window.location.hash.replace('#', '') || 'home'
  setSection(next)
  if (next === 'updates') {
    loadUpdates()
  }
})
