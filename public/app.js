const form = document.querySelector('#downloadForm')
const input = document.querySelector('#videoUrl')
const status = document.querySelector('#status')
const downloadButton = document.querySelector('#downloadButton')
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

function handleDownload(event) {
  event.preventDefault()
  const url = input.value.trim()
  if (!url) {
    showMessage('Enter a valid YouTube link.')
    return
  }
  showMessage('Preparing your download...')
  downloadButton.disabled = true
  window.location.href = `/download?url=${encodeURIComponent(url)}`
  setTimeout(() => {
    downloadButton.disabled = false
  }, 1500)
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

window.addEventListener('hashchange', () => {
  const next = window.location.hash.replace('#', '') || 'home'
  setSection(next)
  if (next === 'updates') {
    loadUpdates()
  }
})
