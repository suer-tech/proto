#!/bin/bash
APP_DIR="$HOME/apps/protocol-maker"
BACKEND_PID_FILE="${APP_DIR}/backend.pid"
FRONTEND_PID_FILE="${APP_DIR}/frontend.pid"

case "$1" in
    start)
        echo "Starting backend..."
        cd ${APP_DIR}
        nohup bash start-backend.sh > backend.log 2>&1 &
        echo $! > ${BACKEND_PID_FILE}
        sleep 2
        
        echo "Starting frontend..."
        nohup bash start-frontend.sh > frontend.log 2>&1 &
        echo $! > ${FRONTEND_PID_FILE}
        sleep 2
        
        echo "Services started"
        echo "Backend PID: $(cat ${BACKEND_PID_FILE})"
        echo "Frontend PID: $(cat ${FRONTEND_PID_FILE})"
        ;;
    stop)
        if [ -f ${BACKEND_PID_FILE} ]; then
            kill $(cat ${BACKEND_PID_FILE}) 2>/dev/null || true
            rm ${BACKEND_PID_FILE}
            echo "Backend stopped"
        fi
        if [ -f ${FRONTEND_PID_FILE} ]; then
            kill $(cat ${FRONTEND_PID_FILE}) 2>/dev/null || true
            rm ${FRONTEND_PID_FILE}
            echo "Frontend stopped"
        fi
        ;;
    restart)
        $0 stop
        sleep 2
        $0 start
        ;;
    status)
        if [ -f ${BACKEND_PID_FILE} ] && kill -0 $(cat ${BACKEND_PID_FILE}) 2>/dev/null; then
            echo "Backend: running (PID: $(cat ${BACKEND_PID_FILE}))"
        else
            echo "Backend: stopped"
        fi
        if [ -f ${FRONTEND_PID_FILE} ] && kill -0 $(cat ${FRONTEND_PID_FILE}) 2>/dev/null; then
            echo "Frontend: running (PID: $(cat ${FRONTEND_PID_FILE}))"
        else
            echo "Frontend: stopped"
        fi
        ;;
    logs)
        tail -f ${APP_DIR}/backend.log ${APP_DIR}/frontend.log
        ;;
    *)
        echo "Usage: $0 {start|stop|restart|status|logs}"
        exit 1
        ;;
esac
