(function() {
  const socket = io.connect(`${document.location.origin}/`);

  const ParentLogEl = document.getElementById('logger');
  const LogEl = document.getElementById('log');
  const ClearLog = document.getElementById('clear_log');
  let should_scroll_log = true;

  ClearLog.addEventListener('click', (e) => {
    e.preventDefault();
    LogEl.innerHTML = '';
  })

  function logmessage({message, level}) {

    const row = document.createElement('div');
    row.classList.add('log-line');

    const levelEl = document.createElement('span');
    levelEl.classList.add(`level`)
    levelEl.classList.add(`level-${level}`)


    const msgEl = document.createElement('span');
    msgEl.classList.add('msg');

    levelEl.innerHTML = `[${level}]`;
    msgEl.innerText = message;

    if ( level ) {
      row.appendChild(levelEl);
    }
    row.appendChild( msgEl );

    LogEl.appendChild( row );

    if ( should_scroll_log ) {
      ParentLogEl.scrollTop = ParentLogEl.scrollHeight + 1000;
    }

  }

  window.LogMessage = logmessage;

  socket.on('logmessage', logmessage);

  ParentLogEl.addEventListener('scroll', () => {
    if ( (ParentLogEl.scrollTop + ParentLogEl.offsetHeight) >= ParentLogEl.scrollHeight ) {
      should_scroll_log = true;
    } else {
      should_scroll_log = false;
    }
  });

  socket.on('connect', () => {
    logmessage({message: '(connected)'});
  });
  socket.on('disconnect', () => {
    logmessage({message: '!disconnected!'});
  });


})();
