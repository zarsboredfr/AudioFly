const http = require('http')
const url = 'http://localhost:3000/download?url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3DeTeD8DAta4c'
http.get(url, res => {
  console.log('status', res.statusCode)
  console.log('content-type', res.headers['content-type'])
  console.log('content-disposition', res.headers['content-disposition'])
  res.destroy()
}).on('error', err => {
  console.error('request error', err.message)
})
